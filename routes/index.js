var express = require('express');
var router = express.Router();
const axios = require('axios');
require('dotenv').config();

// 🔥 CACHE SYSTEM - Economiza chamadas da API
const cache = {
    geocoding: new Map(),
    places: new Map(),
    distances: new Map(),
    details: new Map()
};

const CACHE_DURATION = {
    geocoding: 24 * 60 * 60 * 1000, // 24h - endereço não muda
    places: 30 * 60 * 1000,          // 30min - lugares podem abrir/fechar
    distances: 60 * 60 * 1000,       // 1h - trânsito muda mas não tanto
    details: 24 * 60 * 60 * 1000     // 24h - info do lugar é estável
};

function getCacheKey(...args) {
    return args.join('|');
}

function getFromCache(cacheName, key) {
    const cached = cache[cacheName].get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > CACHE_DURATION[cacheName]) {
        cache[cacheName].delete(key);
        console.log(`🗑️  Cache expirado: ${cacheName} - ${key.substring(0, 50)}`);
        return null;
    }
    
    console.log(`✅ Cache HIT: ${cacheName} - ${key.substring(0, 50)}`);
    return cached.data;
}

function setCache(cacheName, key, data) {
    cache[cacheName].set(key, {
        data,
        timestamp: Date.now()
    });
    console.log(`💾 Salvou no cache: ${cacheName}`);
}

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

    console.log('📍 [DETALHES] Place ID recebido:', placeId);

    if (!placeId) {
        console.log('❌ [DETALHES] ID não fornecido!');
        return res.json({ erro: "ID não fornecido" });
    }

    try {
        // 🔥 Checa cache primeiro
        const cacheKey = getCacheKey('details', placeId);
        const cachedData = getFromCache('details', cacheKey);
        
        if (cachedData) {
            return res.json(cachedData);
        }

        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,formatted_phone_number,photos,reviews,url,website,user_ratings_total,formatted_address,geometry&language=pt-BR&key=${placesKey}`;
        
        console.log('🔍 [DETALHES] Buscando info no Google Places...');
        const response = await axios.get(url);
        const data = response.data.result;
        
        if (!data) {
            console.log('❌ [DETALHES] Local não encontrado!');
            return res.json({ erro: "Local não encontrado no Google." });
        }

        console.log('✅ [DETALHES] Dados recebidos:', data.name);

        let fotosProcessadas = [];
        if (data.photos && data.photos.length > 0) {
            console.log(`📷 [DETALHES] Processando ${data.photos.length} fotos...`);
            fotosProcessadas = data.photos.map(foto => `/proxy-foto?ref=${foto.photo_reference}`);
        }

        const resultado = {
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
        };

        // 🔥 Salva no cache
        setCache('details', cacheKey, resultado);

        res.json(resultado);

    } catch (error) {
        console.error("❌ [DETALHES] ERRO:", error.message);
        res.json({ erro: "Erro ao carregar detalhes." });
    }
});

router.post('/gerar-roteiro', async function(req, res) {
    console.log('\n🚀 ===== INICIANDO GERAÇÃO DE ROTEIRO =====');
    console.log('📥 Body recebido:', req.body);

    let { vibe, latitude, longitude, enderecoManual, raiokm, excludedIds } = req.body;
    
    let orcamentoString = req.body.orcamento ? req.body.orcamento.toString().replace(',', '.') : "0";
    let orcamento = parseFloat(orcamentoString);
    let lugaresJaVistos = excludedIds ? excludedIds.split(',') : [];

    console.log('💰 Orçamento:', orcamento);
    console.log('🎯 Vibe:', vibe);
    console.log('📍 Localização inicial:', { latitude, longitude });
    console.log('🚫 Lugares já vistos:', lugaresJaVistos.length);

    if (isNaN(orcamento) || orcamento <= 0) {
        console.log('❌ Orçamento inválido!');
        return res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Orçamento inválido.", dadosBusca: req.body, mapKey: process.env.GOOGLE_MAPS_API_KEY 
        });
    }

    const incluirUberNoOrcamento = req.body.incluirUber === 'on'; 
    console.log('🚗 Incluir Uber no orçamento?', incluirUberNoOrcamento);

    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || mapsKey;
    const distanceKey = process.env.GOOGLE_DISTANCE_MATRIX || mapsKey;

    if (!mapsKey) {
        console.log('❌ Chave da API ausente!');
        return res.render('index', { title: 'Fugida', roteiros: null, erro: "Chave GOOGLE_MAPS_API_KEY ausente.", dadosBusca: req.body, mapKey: null });
    }

    try {
        let termoBusca = "";
        
        if (latitude && longitude) {
            if (enderecoManual && !enderecoManual.includes("Localização Atual")) {
                termoBusca = enderecoManual.trim();
            }
            console.log('✅ Usando coordenadas diretas');
        } 
        else if (enderecoManual && !enderecoManual.includes("Localização Atual")) {
            console.log('🔍 Buscando geocoding para:', enderecoManual);
            
            termoBusca = enderecoManual.trim();
            if (!termoBusca.toLowerCase().includes('brazil') && !termoBusca.toLowerCase().includes('brasil')) {
                termoBusca += ", Brasil";
            }
            
            // 🔥 Checa cache de geocoding
            const geoCacheKey = getCacheKey('geo', termoBusca);
            const cachedGeo = getFromCache('geocoding', geoCacheKey);
            
            if (cachedGeo) {
                latitude = cachedGeo.lat;
                longitude = cachedGeo.lng;
                console.log('✅ Coordenadas do cache:', { latitude, longitude });
            } else {
                const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(termoBusca)}&region=br&language=pt-BR&key=${mapsKey}`;
                const geoResponse = await axios.get(geoUrl);
                
                console.log('🌍 Status do geocoding:', geoResponse.data.status);
                
                if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
                    const loc = geoResponse.data.results[0].geometry.location;
                    latitude = loc.lat;
                    longitude = loc.lng;
                    
                    // 🔥 Salva no cache
                    setCache('geocoding', geoCacheKey, { lat: latitude, lng: longitude });
                    
                    console.log('✅ Coordenadas obtidas:', { latitude, longitude });
                } else {
                    throw new Error(`Endereço não encontrado.`);
                }
            }
        } 
        else {
            throw new Error("Localização necessária.");
        }

        let raioMetros = raiokm ? parseInt(raiokm) * 1000 : 5000;
        console.log('📏 Raio de busca:', raioMetros, 'metros');

        let priceFilter = "";
        let estimativaUber = 40; 
        let dinheiroLiquido = incluirUberNoOrcamento ? (orcamento - estimativaUber) : orcamento;

        if (dinheiroLiquido >= 300) priceFilter = "&maxprice=4"; 
        else if (dinheiroLiquido >= 150) priceFilter = "&maxprice=3"; 
        else if (dinheiroLiquido >= 80) priceFilter = "&maxprice=2"; 
        else priceFilter = "&maxprice=1"; 

        console.log('💵 Dinheiro líquido:', dinheiroLiquido);
        console.log('🏷️  Filtro de preço:', priceFilter);

        let queryFinal = vibe;
        if (termoBusca) queryFinal = `${vibe} em ${termoBusca}`; 

        console.log('🔎 Query final Places:', queryFinal);

        // 🔥 Checa cache de lugares
        const placesCacheKey = getCacheKey('places', queryFinal, latitude, longitude, raioMetros, priceFilter);
        const cachedPlaces = getFromCache('places', placesCacheKey);
        
        let resultados;
        
        if (cachedPlaces) {
            resultados = cachedPlaces;
        } else {
            const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryFinal)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR${priceFilter}&key=${placesKey}`;
            
            console.log('📡 Chamando Google Places API...');
            let placesResponse = await axios.get(placesUrl);
            resultados = placesResponse.data.results;

            console.log('📊 Resultados recebidos:', resultados.length);

            if (!resultados || resultados.length === 0) {
                console.log('⚠️  Nenhum resultado, tentando fallback...');
                const fallbackUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(vibe)}&location=${latitude},${longitude}&radius=${raioMetros}&openNow=true&language=pt-BR&key=${placesKey}`;
                placesResponse = await axios.get(fallbackUrl);
                resultados = placesResponse.data.results;
                console.log('📊 Resultados fallback:', resultados.length);
            }
            
            // 🔥 Salva no cache
            if (resultados && resultados.length > 0) {
                setCache('places', placesCacheKey, resultados);
            }
        }

        if (!resultados || resultados.length === 0) throw new Error("Nenhum lugar encontrado.");

        let novosResultados = resultados.filter(place => !lugaresJaVistos.includes(place.place_id));
        console.log('🆕 Lugares novos (não vistos):', novosResultados.length);

        if (novosResultados.length === 0) throw new Error("Você já viu todas as opções!");

        let candidatos = shuffleArray(novosResultados);
        console.log('🎲 Lugares embaralhados');

        // 🔥 Checa cache de distâncias
        const distCacheKey = getCacheKey('dist', latitude, longitude, candidatos.map(p => p.place_id).join(','));
        const cachedDistances = getFromCache('distances', distCacheKey);
        
        let elementosDistancia;
        
        if (cachedDistances) {
            elementosDistancia = cachedDistances;
        } else {
            const destinations = candidatos.map(p => `place_id:${p.place_id}`).join('|');
            const distUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destinations}&mode=driving&language=pt-BR&key=${distanceKey}`;
            
            console.log('🗺️  Calculando distâncias...');
            const distResponse = await axios.get(distUrl);
            
            if (!distResponse.data.rows) throw new Error("Erro API Matrix.");
            elementosDistancia = distResponse.data.rows[0].elements;
            
            // 🔥 Salva no cache
            setCache('distances', distCacheKey, elementosDistancia);
            
            console.log('✅ Distâncias calculadas para', elementosDistancia.length, 'lugares');
        }

        let roteirosFinais = [];

        for (let i = 0; i < candidatos.length; i++) {
            const lugar = candidatos[i];
            const infoDist = elementosDistancia[i];

            if (infoDist && infoDist.status === 'OK') {
                const distanciaKm = infoDist.distance.value / 1000;
                const raioKm = raioMetros / 1000;
                
                if (distanciaKm > raioKm) {
                    console.log(`⏭️  ${lugar.name} - Fora do raio (${distanciaKm.toFixed(1)}km)`);
                    continue; 
                }
                
                const precoBase = 7.50;
                const precoPorKm = 2.65; 
                let custoUberTotal = ((precoBase + (distanciaKm * precoPorKm)) * 2) * 1.15; 
                let saldo = incluirUberNoOrcamento ? (orcamento - custoUberTotal) : orcamento;
                
                if (incluirUberNoOrcamento && custoUberTotal > (orcamento * 0.45)) {
                    console.log(`⏭️  ${lugar.name} - Uber muito caro (R$ ${custoUberTotal.toFixed(2)})`);
                    continue;
                }
                
                if (saldo < 15) {
                    console.log(`⏭️  ${lugar.name} - Saldo insuficiente (R$ ${saldo.toFixed(2)})`);
                    continue; 
                }

                let fotoUrl = null;
                if (lugar.photos && lugar.photos.length > 0) {
                    fotoUrl = `/proxy-foto?ref=${lugar.photos[0].photo_reference}`;
                } else {
                    fotoUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lugar.geometry.location.lat},${lugar.geometry.location.lng}&fov=80&source=outdoor&key=${mapsKey}`;
                }

                console.log(`✅ ${lugar.name} - Adicionado! (${distanciaKm.toFixed(1)}km, R$ ${saldo.toFixed(2)} saldo)`);

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
        console.log('🏆 Roteiros finais ordenados:', roteirosFinais.length);

        if (roteirosFinais.length === 0) {
            throw new Error("Não encontramos lugares neste raio/preço.");
        }

        console.log('✨ ===== ROTEIRO GERADO COM SUCESSO =====\n');

        res.render('index', { 
            title: 'Fugida', 
            roteiros: roteirosFinais, 
            erro: null,
            dadosBusca: { ...req.body, latitude, longitude },
            mapKey: mapsKey
        });

    } catch (error) {
        console.error("❌ ===== ERRO GERAL =====");
        console.error("Mensagem:", error.message);
        console.error("Stack:", error.stack);
        
        res.render('index', { 
            title: 'Fugida', roteiros: null, 
            erro: "Erro: " + error.message,
            dadosBusca: { ...req.body },
            mapKey: process.env.GOOGLE_MAPS_API_KEY
        });
    }
});

module.exports = router;