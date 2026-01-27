var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();

// Função para embaralhar
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getEstimativaPreco(level) {
    switch (parseInt(level)) {
        case 0: return "Grátis / Muito Barato";
        case 1: return "Econômico (R$ 30 - R$ 60)";
        case 2: return "Moderado (R$ 60 - R$ 120)";
        case 3: return "Sofisticado (R$ 120 - R$ 250)";
        case 4: return "Luxo (R$ 250+)";
        default: return "Preço Variável";
    }
}

router.get('/', function(req, res) {
  res.render('index', { 
    title: 'Fugida', 
    roteiros: null, 
    erro: null, 
    dadosBusca: null,
    mapKey: process.env.GOOGLE_MAPS_API_KEY
  });
});

router.post('/gerar-roteiro', async function(req, res) {
    let { vibe, latitude, longitude, enderecoManual, raiokm, excludedIds } = req.body;
    
    // Tratamento de dinheiro
    let orcamentoString = req.body.orcamento ? req.body.orcamento.toString().replace(',', '.') : "0";
    let orcamento = parseFloat(orcamentoString);
    
    // Tratamento de Lugares Excluídos (para não repetir)
    let lugaresJaVistos = excludedIds ? excludedIds.split(',') : [];

    if (isNaN(orcamento) || orcamento <= 0) {
        return res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Orçamento inválido.", dadosBusca: req.body, mapKey: process.env.GOOGLE_MAPS_API_KEY 
        });
    }

    const incluirUberNoOrcamento = req.body.incluirUber === 'on'; 
    const keyPlaces = process.env.GOOGLE_PLACES_API_KEY;
    const keyDistance = process.env.GOOGLE_DISTANCE_MATRIX;
    const keyGeo = process.env.GOOGLE_MAPS_API_KEY || keyPlaces;

    if (!keyPlaces || !keyDistance) {
        return res.render('index', { title: 'Fugida', roteiros: null, erro: "Chaves de API ausentes.", dadosBusca: req.body, mapKey: process.env.GOOGLE_MAPS_API_KEY });
    }

    try {
        let termoBusca = "";
        
        // --- 1. RESOLVER LOCALIZAÇÃO ---
        if (enderecoManual && enderecoManual !== "Localização Atual (GPS Ativo)" && (!latitude || !longitude)) {
            termoBusca = enderecoManual.trim();
            if (!termoBusca.toLowerCase().includes('brazil') && !termoBusca.toLowerCase().includes('brasil')) {
                termoBusca += ", Brasil";
            }
            
            console.log(`[GEO] Buscando: ${termoBusca}`);
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(termoBusca)}&region=br&language=pt-BR&key=${keyGeo}`;
            const geoResponse = await axios.get(geoUrl);
            
            if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
                const loc = geoResponse.data.results[0].geometry.location;
                latitude = loc.lat;
                longitude = loc.lng;
            } else {
                throw new Error(`Endereço não encontrado: ${enderecoManual}`);
            }
        } else if (!latitude || !longitude) {
            throw new Error("Localização necessária.");
        }

        // --- 2. RAIO (SLIDER vs AUTOMÁTICO) ---
        let raioMetros;
        if (raiokm) {
            // Se o usuário usou o slider, respeita o slider
            raioMetros = parseInt(raiokm) * 1000;
            console.log(`[RAIO] Usuário definiu: ${raioMetros}m`);
        } else {
            // Padrão 5km se não vier nada
            raioMetros = 5000;
        }

        // --- 3. FILTRO DE PREÇO ---
        let priceFilter = "";
        let estimativaUber = 40; 
        let dinheiroLiquido = incluirUberNoOrcamento ? (orcamento - estimativaUber) : orcamento;

        if (dinheiroLiquido >= 300) priceFilter = "&minprice=3"; 
        else if (dinheiroLiquido >= 150) priceFilter = "&minprice=2&maxprice=3";
        else if (dinheiroLiquido <= 60) priceFilter = "&maxprice=1";
        else priceFilter = "&maxprice=2";

        // --- 4. BUSCA ---
        let queryFinal = vibe;
        if (termoBusca) queryFinal = `${vibe} em ${termoBusca}`;

        const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryFinal)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR${priceFilter}&key=${keyPlaces}`;
        
        let placesResponse = await axios.get(placesUrl);
        let resultados = placesResponse.data.results;

        // Fallback
        if (!resultados || resultados.length === 0) {
            const fallbackUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(vibe)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR&key=${keyPlaces}`;
            placesResponse = await axios.get(fallbackUrl);
            resultados = placesResponse.data.results;
        }

        if (!resultados || resultados.length === 0) {
            throw new Error("Nenhum lugar encontrado nesse raio. Tenta aumentar o raio ou mudar o orçamento, z!");
        }

        // --- 5. FILTRO DE REPETIÇÃO ("NÃO GOSTEI") ---
        let novosResultados = resultados.filter(place => !lugaresJaVistos.includes(place.place_id));

        if (novosResultados.length === 0) {
            throw new Error("Uau! Você já viu todas as opções dessa região. Tente mudar o raio ou a vibe.");
        }

        let bonsLugares = shuffleArray(novosResultados);
        let candidatos = bonsLugares; // MUDANÇA: Pega TODOS os resultados, não limita mais

        // --- 6. DISTÂNCIA E CÁLCULOS ---
        const destinations = candidatos.map(p => `place_id:${p.place_id}`).join('|');
        const distUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destinations}&mode=driving&language=pt-BR&key=${keyDistance}`;
        const distResponse = await axios.get(distUrl);
        
        if (!distResponse.data.rows) throw new Error("Erro API Matrix.");
        const elementosDistancia = distResponse.data.rows[0].elements;
        let roteirosFinais = [];

        candidatos.forEach((lugar, index) => {
            const infoDist = elementosDistancia[index];
            if (infoDist && infoDist.status === 'OK') {
                const distanciaKm = infoDist.distance.value / 1000;
                const raioKm = raioMetros / 1000;
                
                // FILTRO CRÍTICO: Se o lugar tá fora do raio, ignora completamente
                if (distanciaKm > raioKm) {
                    console.log(`[FILTRO] ${lugar.name} tá a ${distanciaKm.toFixed(1)}km - FORA do raio de ${raioKm}km`);
                    return;
                }
                
                // Uber
                const precoBase = 7.50;
                const precoPorKm = 2.65; 
                let custoUberTotal = ((precoBase + (distanciaKm * precoPorKm)) * 2) * 1.15; 
                let saldo = incluirUberNoOrcamento ? (orcamento - custoUberTotal) : orcamento;
                
                if (incluirUberNoOrcamento && custoUberTotal > (orcamento * 0.45)) return;
                if (saldo < 15) return; 

                // Foto
                let fotoUrl;
                if (lugar.photos && lugar.photos.length > 0) {
                    fotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${lugar.photos[0].photo_reference}&key=${keyPlaces}`;
                } else {
                    const lat = lugar.geometry.location.lat;
                    const lng = lugar.geometry.location.lng;
                    fotoUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&heading=0&pitch=10&source=outdoor&key=${keyGeo}`;
                }

                roteirosFinais.push({
                    id: lugar.place_id,
                    nome: lugar.name,
                    endereco: lugar.formatted_address,
                    rating: lugar.rating || "Novo",
                    total_reviews: lugar.user_ratings_total || 0,
                    distancia: infoDist.distance.text,
                    precoUber: custoUberTotal.toFixed(2).replace('.', ','),
                    saldo: saldo.toFixed(2).replace('.', ','),
                    foto: fotoUrl,
                    estimativa_preco: getEstimativaPreco(lugar.price_level),
                    incluirUber: incluirUberNoOrcamento,
                    lat: lugar.geometry.location.lat,
                    lng: lugar.geometry.location.lng
                });
            }
        });

        roteirosFinais.sort((a, b) => b.rating - a.rating);
        // MUDANÇA: Removido o slice(0, 5) - agora mostra TODOS os resultados

        if (roteirosFinais.length === 0) {
            throw new Error("Nenhum lugar viável com esse orçamento nesse raio. Aumenta o raio ou o orçamento!");
        }

        res.render('index', { 
            title: 'Fugida', 
            roteiros: roteirosFinais, 
            erro: null,
            dadosBusca: { ...req.body, latitude, longitude },
            mapKey: process.env.GOOGLE_MAPS_API_KEY
        });

    } catch (error) {
        console.error("ERRO:", error.message);
        res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Erro: " + error.message,
            dadosBusca: { ...req.body },
            mapKey: process.env.GOOGLE_MAPS_API_KEY
        });
    }
});

module.exports = router;