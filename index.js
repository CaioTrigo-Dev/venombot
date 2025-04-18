const venom = require('venom-bot');
const axios = require('axios');
const banco = require('./banco');

// Configurações do Chatwoot
const chatwootConfig = {
    baseUrl: 'https://app.chatwoot.com',
    accountId: '117974',
    inboxId: 62196,
    apiToken: 'hE9PdLiRseEkSovrShPxCxMF'
};

const treinamento = `agora você vai atuar como meu atendente de uma loja de mecanica...`; // seu prompt atual

venom
    .create({
        session: 'chatgpt bot',
        multidevice: true,
        headless: false,
        useChrome: true,
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
                source_id: phoneNumber, // Usando o número de telefone como source_id
                inbox_id: chatwootConfig.inboxId,
                contact: {
                    name: name || "Usuário " + phoneNumber.split('@')[0], // Nome do contato ou número
                    phone_number: phoneNumber.split('@')[0] // Remove a parte @c.us
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
        return response.data.id; // Retorna o ID da conversa
    } catch (erro) {
        console.error('❌ Erro ao criar conversa:', erro.response?.data || erro.message);
        console.error('Status do erro:', erro.response?.status);
        console.error('Headers da resposta:', erro.response?.headers);
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