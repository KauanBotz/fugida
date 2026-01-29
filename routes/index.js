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
    
    let orcamentoString = req.body.orcamento ? req.body.orcamento.toString().replace(',', '.') : "0";
    let orcamento = parseFloat(orcamentoString);
    let lugaresJaVistos = excludedIds ? excludedIds.split(',') : [];

    // Validar Inputs
    if (isNaN(orcamento) || orcamento <= 0) {
        return res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Orçamento inválido.", dadosBusca: req.body, mapKey: process.env.GOOGLE_MAPS_API_KEY 
        });
    }

    const incluirUberNoOrcamento = req.body.incluirUber === 'on'; 
    
    // Configuração de chaves
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || mapsKey;
    const distanceKey = process.env.GOOGLE_DISTANCE_MATRIX || mapsKey;

    if (!mapsKey) {
        return res.render('index', { title: 'Fugida', roteiros: null, erro: "Chave GOOGLE_MAPS_API_KEY ausente.", dadosBusca: req.body, mapKey: null });
    }

    try {
        let termoBusca = "";
        
        // --- 1. RESOLVER LOCALIZAÇÃO (CORRIGIDO) ---
        // A Lógica nova: Se tem endereço escrito (e não é o texto do GPS), 
        // força a busca nova, IGNORANDO as lats/longs antigas que vieram no hidden input.
        const isGpsText = enderecoManual && enderecoManual.includes("Localização Atual");
        
        if (enderecoManual && !isGpsText) {
            termoBusca = enderecoManual.trim();
            if (!termoBusca.toLowerCase().includes('brazil') && !termoBusca.toLowerCase().includes('brasil')) {
                termoBusca += ", Brasil";
            }
            
            console.log(`[GEO] Buscando novo endereço: ${termoBusca}`);
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(termoBusca)}&region=br&language=pt-BR&key=${mapsKey}`;
            const geoResponse = await axios.get(geoUrl);
            
            if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
                const loc = geoResponse.data.results[0].geometry.location;
                latitude = loc.lat;
                longitude = loc.lng;
                // Importante: Atualizamos as variáveis latitude/longitude aqui
            } else {
                throw new Error(`Endereço não encontrado: ${enderecoManual}`);
            }
        } 
        // Se não digitou nada novo, aí sim verifica se tem coordenadas (GPS ou busca anterior)
        else if (!latitude || !longitude) {
            throw new Error("Localização necessária.");
        }

        // --- 2. RAIO ---
        let raioMetros = raiokm ? parseInt(raiokm) * 1000 : 5000;

        // --- 3. FILTRO DE PREÇO ---
        let priceFilter = "";
        let estimativaUber = 40; 
        let dinheiroLiquido = incluirUberNoOrcamento ? (orcamento - estimativaUber) : orcamento;

        if (dinheiroLiquido >= 300) priceFilter = "&maxprice=4"; 
        else if (dinheiroLiquido >= 150) priceFilter = "&maxprice=3"; 
        else if (dinheiroLiquido >= 80) priceFilter = "&maxprice=2"; 
        else priceFilter = "&maxprice=1"; 

        // --- 4. BUSCA INICIAL ---
        let queryFinal = vibe;
        if (termoBusca) queryFinal = `${vibe} em ${termoBusca}`; 
        // Nota: Se usou GPS, termoBusca é vazio, busca só pela "vibe" perto da lat/lng

        const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryFinal)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR${priceFilter}&key=${placesKey}`;
        
        console.log(`[PLACES] Buscando: ${queryFinal} (Lat: ${latitude}, Lng: ${longitude})`);
        let placesResponse = await axios.get(placesUrl);
        let resultados = placesResponse.data.results;

        // Fallback
        if (!resultados || resultados.length === 0) {
            console.log("[PLACES] Busca vazia. Tentando fallback...");
            const fallbackUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(vibe)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR&key=${placesKey}`;
            placesResponse = await axios.get(fallbackUrl);
            resultados = placesResponse.data.results;
        }

        if (!resultados || resultados.length === 0) throw new Error("Nenhum lugar encontrado.");

        let novosResultados = resultados.filter(place => !lugaresJaVistos.includes(place.place_id));
        if (novosResultados.length === 0) throw new Error("Você já viu todas as opções dessa região!");

        let candidatos = shuffleArray(novosResultados);

        // --- 5. DISTÂNCIA ---
        const destinations = candidatos.map(p => `place_id:${p.place_id}`).join('|');
        const distUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destinations}&mode=driving&language=pt-BR&key=${distanceKey}`;
        const distResponse = await axios.get(distUrl);
        
        if (!distResponse.data.rows) throw new Error("Erro API Matrix.");
        const elementosDistancia = distResponse.data.rows[0].elements;
        let roteirosFinais = [];

        // LOOP
        for (let i = 0; i < candidatos.length; i++) {
            const lugar = candidatos[i];
            const infoDist = elementosDistancia[i];

            if (infoDist && infoDist.status === 'OK') {
                const distanciaKm = infoDist.distance.value / 1000;
                const raioKm = raioMetros / 1000;
                
                if (distanciaKm > raioKm) continue; 
                
                const precoBase = 7.50;
                const precoPorKm = 2.65; 
                let custoUberTotal = ((precoBase + (distanciaKm * precoPorKm)) * 2) * 1.15; 
                let saldo = incluirUberNoOrcamento ? (orcamento - custoUberTotal) : orcamento;
                
                if (incluirUberNoOrcamento && custoUberTotal > (orcamento * 0.45)) continue;
                if (saldo < 15) continue; 

                // --- LÓGICA DE FOTO OBRIGATÓRIA (FINAL) ---
                let fotoUrl = null;
                const lat = lugar.geometry.location.lat;
                const lng = lugar.geometry.location.lng;

                // 1. Tenta pegar a foto oficial (usando placesKey)
                if (lugar.photos && lugar.photos.length > 0) {
                    fotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${lugar.photos[0].photo_reference}&key=${placesKey}`;
                } 
                else {
                    // 2. Deep Search se não veio no primeiro request
                    try {
                        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${lugar.place_id}&fields=name,photos&key=${placesKey}`;
                        const detailsResponse = await axios.get(detailsUrl);
                        
                        if (detailsResponse.data.result && detailsResponse.data.result.photos && detailsResponse.data.result.photos.length > 0) {
                            const ref = detailsResponse.data.result.photos[0].photo_reference;
                            fotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${ref}&key=${placesKey}`;
                            console.log(`[FOTO] Deep Search achou: ${lugar.name}`);
                        } 
                    } catch (err) {
                        console.error(`[FOTO] Erro Deep Search: ${lugar.name}`);
                    }
                }

                // 3. Fallback Street View (usando mapsKey)
                if (!fotoUrl) {
                    console.log(`[FOTO] Usando Street View para: ${lugar.name}`);
                    fotoUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=80&source=outdoor&key=${mapsKey}`;
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
                    lat: lat,
                    lng: lng
                });
            }
        }

        roteirosFinais.sort((a, b) => b.rating - a.rating);

        if (roteirosFinais.length === 0) {
            throw new Error("Não encontramos lugares neste raio/preço. Tente aumentar o raio ou o orçamento.");
        }

        res.render('index', { 
            title: 'Fugida', 
            roteiros: roteirosFinais, 
            erro: null,
            dadosBusca: { ...req.body, latitude, longitude },
            mapKey: mapsKey
        });

    } catch (error) {
        console.error("ERRO GERAL:", error.message);
        res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Erro: " + error.message,
            dadosBusca: { ...req.body },
            mapKey: process.env.GOOGLE_MAPS_API_KEY
        });
    }
});

module.exports = router;