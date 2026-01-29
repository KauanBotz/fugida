var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();

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

router.get('/detalhes-lugar/:placeId', async function(req, res) {
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    const placeId = req.params.placeId;

    if (!placeId) return res.json({ erro: "ID não fornecido" });

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,formatted_phone_number,photos,reviews,url,website,user_ratings_total,formatted_address,geometry&language=pt-BR&key=${placesKey}`;
        const response = await axios.get(url);
        
        const data = response.data.result;
        
        if (!data) return res.json({ erro: "Local não encontrado no Google." });

        let fotosProcessadas = [];
        if (data.photos && data.photos.length > 0) {
            fotosProcessadas = data.photos.map(foto => {
                return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${foto.photo_reference}&key=${placesKey}`;
            });
        }

        res.json({
            nome: data.name,
            endereco: data.formatted_address,
            rating: data.rating,
            user_ratings_total: data.user_ratings_total,
            telefone: data.formatted_phone_number,
            website: data.website || data.url,
            lat: data.geometry.location.lat,
            lng: data.geometry.location.lng,
            fotos: fotosProcessadas,
            reviews: data.reviews || []
        });

    } catch (error) {
        console.error("Erro ao buscar detalhes:", error.message);
        res.json({ erro: "Erro ao carregar detalhes." });
    }
});

router.post('/gerar-roteiro', async function(req, res) {
    let { vibe, latitude, longitude, enderecoManual, raiokm, excludedIds } = req.body;
    
    let orcamentoString = req.body.orcamento ? req.body.orcamento.toString().replace(',', '.') : "0";
    let orcamento = parseFloat(orcamentoString);
    let lugaresJaVistos = excludedIds ? excludedIds.split(',') : [];

    if (isNaN(orcamento) || orcamento <= 0) {
        return res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Orçamento inválido.", dadosBusca: req.body, mapKey: process.env.GOOGLE_MAPS_API_KEY 
        });
    }

    const incluirUberNoOrcamento = req.body.incluirUber === 'on'; 
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || mapsKey;
    const distanceKey = process.env.GOOGLE_DISTANCE_MATRIX || mapsKey;

    if (!mapsKey) {
        return res.render('index', { title: 'Fugida', roteiros: null, erro: "Chave GOOGLE_MAPS_API_KEY ausente.", dadosBusca: req.body, mapKey: null });
    }

    try {
        let termoBusca = "";
        
        if (latitude && longitude) {
            if (enderecoManual && !enderecoManual.includes("Localização Atual")) {
                termoBusca = enderecoManual.trim();
            }
        } 
        else if (enderecoManual && !enderecoManual.includes("Localização Atual")) {
            termoBusca = enderecoManual.trim();
            if (!termoBusca.toLowerCase().includes('brazil') && !termoBusca.toLowerCase().includes('brasil')) {
                termoBusca += ", Brasil";
            }
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(termoBusca)}&region=br&language=pt-BR&key=${mapsKey}`;
            const geoResponse = await axios.get(geoUrl);
            
            if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
                const loc = geoResponse.data.results[0].geometry.location;
                latitude = loc.lat;
                longitude = loc.lng;
            } else {
                throw new Error(`Endereço não encontrado.`);
            }
        } 
        else {
            throw new Error("Localização necessária.");
        }

        let raioMetros = raiokm ? parseInt(raiokm) * 1000 : 5000;
        let priceFilter = "";
        let estimativaUber = 40; 
        let dinheiroLiquido = incluirUberNoOrcamento ? (orcamento - estimativaUber) : orcamento;

        if (dinheiroLiquido >= 300) priceFilter = "&maxprice=4"; 
        else if (dinheiroLiquido >= 150) priceFilter = "&maxprice=3"; 
        else if (dinheiroLiquido >= 80) priceFilter = "&maxprice=2"; 
        else priceFilter = "&maxprice=1"; 

        let queryFinal = vibe;
        if (termoBusca) queryFinal = `${vibe} em ${termoBusca}`; 

        const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryFinal)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR${priceFilter}&key=${placesKey}`;
        
        let placesResponse = await axios.get(placesUrl);
        let resultados = placesResponse.data.results;

        if (!resultados || resultados.length === 0) {
            const fallbackUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(vibe)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR&key=${placesKey}`;
            placesResponse = await axios.get(fallbackUrl);
            resultados = placesResponse.data.results;
        }

        if (!resultados || resultados.length === 0) throw new Error("Nenhum lugar encontrado.");

        let novosResultados = resultados.filter(place => !lugaresJaVistos.includes(place.place_id));
        if (novosResultados.length === 0) throw new Error("Você já viu todas as opções!");

        let candidatos = shuffleArray(novosResultados);

        const destinations = candidatos.map(p => `place_id:${p.place_id}`).join('|');
        const distUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destinations}&mode=driving&language=pt-BR&key=${distanceKey}`;
        const distResponse = await axios.get(distUrl);
        
        if (!distResponse.data.rows) throw new Error("Erro API Matrix.");
        const elementosDistancia = distResponse.data.rows[0].elements;
        let roteirosFinais = [];

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

                let fotoUrl = null;
                if (lugar.photos && lugar.photos.length > 0) {
                    fotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${lugar.photos[0].photo_reference}&key=${placesKey}`;
                } else {
                    fotoUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lugar.geometry.location.lat},${lugar.geometry.location.lng}&fov=80&source=outdoor&key=${mapsKey}`;
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
        }

        roteirosFinais.sort((a, b) => b.rating - a.rating);

        if (roteirosFinais.length === 0) {
            throw new Error("Não encontramos lugares neste raio/preço.");
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