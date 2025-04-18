const venom = require('venom-bot');
const axios = require('axios');
const banco = require('./banco');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

// Configurações do Chatwoot
const chatwootConfig = {
    baseUrl: process.env.CHATWOOT_BASE_URL,
    accountId: process.env.CHATWOOT_ACCOUNT_ID,
    inboxId: process.env.CHATWOOT_INBOX_ID,
    apiToken: process.env.CHATWOOT_API_TOKEN
};

const treinamento = `agora você vai atuar como meu atendente de uma loja de mecanica...`;

venom
    .create({
        session: process.env.WHATSAPP_SESSION_NAME,
        multidevice: true,
        headless: process.env.WHATSAPP_HEADLESS === 'true',
        useChrome: process.env.WHATSAPP_USE_CHROME === 'true',
    })
    .then((client) => start(client))
    .catch((erro) => {
        console.log(erro);
    });

// Função para criar uma nova conversa no Chatwoot
async function criarConversa(phoneNumber, name) {
    try {
        const response = await axios.post(
            `${chatwootConfig.baseUrl}/api/v1/accounts/${chatwootConfig.accountId}/conversations`,
            {
                source_id: phoneNumber,
                inbox_id: chatwootConfig.inboxId,
                contact: {
                    name: name || "Usuário " + phoneNumber.split('@')[0],
                    phone_number: phoneNumber.split('@')[0]
                }
            },
            {
                headers: {
                    'api_access_token': chatwootConfig.apiToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Conversa criada:", response.data);
        return response.data.id;
    } catch (erro) {
        console.error('❌ Erro ao criar conversa:', erro.response?.data || erro.message);
        console.error('Status do erro:', erro.response?.status);
        return null;
    }
}

// Função para enviar mensagem para uma conversa existente no Chatwoot
async function enviarMensagemChatwoot(conversationId, message) {
    try {
        const response = await axios.post(
            `${chatwootConfig.baseUrl}/api/v1/accounts/${chatwootConfig.accountId}/conversations/${conversationId}/messages`,
            {
                content: message,
                message_type: 'incoming' // Indica que é uma mensagem recebida
            },
            {
                headers: {
                    'api_access_token': chatwootConfig.apiToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Mensagem enviada ao Chatwoot:", response.data);
        return response.data;
    } catch (erro) {
        console.error('❌ Erro ao enviar mensagem ao Chatwoot:', erro.response?.data || erro.message);
        return null;
    }
}

function start(client) {
    client.onMessage(async (message) => {
        // Verificar se o usuário já está cadastrado no banco local
        const userCadastrado = banco.db.find(numero => numero.num === message.from);
        let conversationId;
        
        if (!userCadastrado) {
            console.log("Cadastrando Usuário:", message.from);
            // Criar conversa no Chatwoot e armazenar o ID
            conversationId = await criarConversa(message.from, message.sender?.name);
            // Adicionar ao banco local
            banco.db.push({
                num: message.from, 
                historico: [], 
                chatwootConversationId: conversationId
            });
        } else {
            console.log("Usuário já cadastrado");
            conversationId = userCadastrado.chatwootConversationId;
            
            // Se não tiver ID de conversa, cria uma nova
            if (!conversationId) {
                conversationId = await criarConversa(message.from, message.sender?.name);
                userCadastrado.chatwootConversationId = conversationId;
            }
        }
        
        // Buscar o registro do usuário atualizado
        const historico = banco.db.find(num => num.num === message.from);
        historico.historico.push('user:' + message.body);
        
        // Enviar mensagem recebida do WhatsApp para o Chatwoot
        if (conversationId) {
            await enviarMensagemChatwoot(conversationId, message.body);
        }

        // Aqui você pode descomentar o código para usar o LLaMA 3
        // E então enviar a resposta do LLaMA tanto para o WhatsApp quanto para o Chatwoot
    });
}