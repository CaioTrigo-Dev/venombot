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

// Exemplo de treinamento (não usado no código atual, mas mantido)
const treinamento = `agora você vai atuar como meu atendente de uma loja de mecanica...`;

venom
    .create(
        { // Objeto de opções principal
            session: process.env.WHATSAPP_SESSION_NAME, // Nome da sessão do WhatsApp
            multidevice: true, // Habilita o modo multidispositivo
            headless: process.env.WHATSAPP_HEADLESS === 'true', // Controla se o navegador roda em modo headless (sem interface gráfica visível)
            useChrome: process.env.WHATSAPP_USE_CHROME === 'true', // Tenta usar o Google Chrome instalado no sistema

            // --- Modificação Adicionada ---
            // Opções passadas diretamente para o Puppeteer (que controla o navegador)
            puppeteerOptions: {
                // Define explicitamente qual navegador usar
                executablePath: '/usr/bin/google-chrome-stable',

                // Argumentos para tentar contornar problemas comuns em servidores
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',           // Útil se não há GPU ou drivers corretos
                    '--disable-dev-shm-usage', // Útil se a partição /dev/shm é pequena
                    '--no-zygote',           // Ajuda em alguns ambientes restritos
                    // '--single-process'    // Tente adicionar se suspeitar de falta de memória
                ]
            }
            // --- Fim da Modificação ---
        }
    )
    .then((client) => {
        console.log("Cliente Venom criado com sucesso!");
        start(client); // Inicia a lógica principal do bot
    })
    .catch((erro) => {
        // Usar console.error para erros é uma boa prática
        console.error('❌ Erro ao criar cliente Venom:', erro);
        // Considerar encerrar o processo se a criação falhar criticamente
        // process.exit(1);
    });

// Função para criar uma nova conversa no Chatwoot
async function criarConversa(phoneNumber, name) {
    // Verifica se as configurações do Chatwoot estão presentes
    if (!chatwootConfig.baseUrl || !chatwootConfig.accountId || !chatwootConfig.inboxId || !chatwootConfig.apiToken) {
        console.warn("⚠️ Configurações do Chatwoot não definidas. Não será possível criar conversa.");
        return null;
    }
    try {
        // Formata o número removendo o @c.us ou @g.us
        const cleanPhoneNumber = phoneNumber.split('@')[0];
        const contactName = name || "Usuário " + cleanPhoneNumber; // Usa o nome do sender ou um padrão

        console.log(`Tentando criar conversa para: ${contactName} (${cleanPhoneNumber})`);

        const response = await axios.post(
            `${chatwootConfig.baseUrl}/api/v1/accounts/${chatwootConfig.accountId}/conversations`,
            {
                source_id: cleanPhoneNumber, // Usa o número limpo como source_id
                inbox_id: chatwootConfig.inboxId,
                contact: {
                    name: contactName,
                    phone_number: `+${cleanPhoneNumber}` // Adiciona o '+' para formato E.164 se necessário
                },
                // Você pode adicionar mais informações se quiser
                // status: 'open',
                // assignee_id: SEU_ID_DE_AGENTE, // Para atribuir a um agente específico
            },
            {
                headers: {
                    'api_access_token': chatwootConfig.apiToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Conversa criada no Chatwoot:", response.data.id);
        return response.data.id; // Retorna o ID da conversa criada
    } catch (erro) {
        console.error('❌ Erro ao criar conversa no Chatwoot:');
        if (erro.response) {
            // O servidor respondeu com um status fora do range 2xx
            console.error('Dados:', erro.response.data);
            console.error('Status:', erro.response.status);
            console.error('Headers:', erro.response.headers);
        } else if (erro.request) {
            // A requisição foi feita mas não houve resposta
            console.error('Requisição feita, sem resposta:', erro.request);
        } else {
            // Algo aconteceu ao configurar a requisição
            console.error('Erro na configuração da requisição:', erro.message);
        }
        return null;
    }
}

// Função para enviar mensagem para uma conversa existente no Chatwoot
async function enviarMensagemChatwoot(conversationId, messageContent) {
    // Verifica se as configurações e o ID da conversa são válidos
    if (!chatwootConfig.baseUrl || !chatwootConfig.accountId || !chatwootConfig.apiToken || !conversationId) {
        console.warn("⚠️ Configurações do Chatwoot incompletas ou ID da conversa ausente. Não será possível enviar mensagem.");
        return null;
    }
    try {
        console.log(`Enviando mensagem para Chatwoot (Conv ID: ${conversationId}): "${messageContent}"`);
        const response = await axios.post(
            `${chatwootConfig.baseUrl}/api/v1/accounts/${chatwootConfig.accountId}/conversations/${conversationId}/messages`,
            {
                content: messageContent,
                message_type: 'incoming', // Indica que é uma mensagem recebida do contato (vindo do WhatsApp)
                private: false // Mensagem não é privada (interna)
            },
            {
                headers: {
                    'api_access_token': chatwootConfig.apiToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ Mensagem enviada ao Chatwoot com sucesso.");
        return response.data;
    } catch (erro) {
        console.error(`❌ Erro ao enviar mensagem para Chatwoot (Conv ID: ${conversationId}):`);
         if (erro.response) {
            console.error('Dados:', erro.response.data);
            console.error('Status:', erro.response.status);
        } else if (erro.request) {
            console.error('Requisição feita, sem resposta:', erro.request);
        } else {
            console.error('Erro na configuração da requisição:', erro.message);
        }
        return null;
    }
}

// Função principal que é chamada após o cliente Venom ser criado
function start(client) {
    console.log('Função start iniciada. Aguardando mensagens...');

    // Listener para novas mensagens recebidas
    client.onMessage(async (message) => {
        console.log('--- Nova Mensagem Recebida ---');
        console.log('De:', message.from);
        console.log('Nome do Remetente:', message.sender?.pushname || message.sender?.name || 'Não disponível'); // Tenta obter o nome
        console.log('É Grupo?', message.isGroupMsg);
        console.log('Conteúdo:', message.body);
        console.log('-----------------------------');

        // Ignorar mensagens de grupo ou sem conteúdo
        if (message.isGroupMsg || !message.body) {
            console.log("Ignorando mensagem de grupo ou sem conteúdo.");
            return;
        }

        // Verificar se o usuário já está no nosso "banco de dados" em memória
        let userData = banco.db.find(user => user.num === message.from);
        let conversationId;

        if (!userData) {
            console.log(`Usuário ${message.from} não encontrado no banco local. Criando novo registro e conversa no Chatwoot.`);
            // 1. Criar a conversa no Chatwoot
            conversationId = await criarConversa(message.from, message.sender?.pushname || message.sender?.name);

            // 2. Adicionar ao banco local SOMENTE se a conversa foi criada com sucesso
            if (conversationId) {
                 userData = {
                    num: message.from,
                    historico: [], // Inicializa histórico vazio
                    chatwootConversationId: conversationId
                };
                banco.db.push(userData);
                console.log(`Usuário ${message.from} adicionado ao banco local com ID de conversa ${conversationId}.`);
            } else {
                console.error(`Não foi possível criar conversa no Chatwoot para ${message.from}. O usuário não será adicionado ao banco local.`);
                // Você pode querer tentar criar a conversa novamente mais tarde ou logar isso de forma persistente
                return; // Interrompe o processamento desta mensagem se não puder criar a conversa
            }

        } else {
            console.log(`Usuário ${message.from} já existe no banco local.`);
            conversationId = userData.chatwootConversationId;

            // Verifica se, por algum motivo, o usuário existe mas não tem ID de conversa
            if (!conversationId) {
                console.warn(`Usuário ${message.from} existe mas sem ID de conversa Chatwoot. Tentando criar uma nova.`);
                conversationId = await criarConversa(message.from, message.sender?.pushname || message.sender?.name);
                if (conversationId) {
                    userData.chatwootConversationId = conversationId; // Atualiza o registro no banco local
                     console.log(`ID de conversa ${conversationId} associado ao usuário ${message.from}.`);
                } else {
                     console.error(`Falha ao criar nova conversa no Chatwoot para ${message.from} que estava sem ID.`);
                     // Decide o que fazer - talvez não enviar a mensagem?
                     return;
                }
            }
        }

        // Adiciona a mensagem atual ao histórico do usuário no banco local
        // Certifica-se de que userData e userData.historico existem
        if (userData && userData.historico) {
             userData.historico.push('user:' + message.body);
             console.log(`Histórico de ${message.from} atualizado.`);
             // console.log(userData.historico); // Descomente para ver o histórico completo
        } else {
             console.error(`Erro: Não foi possível encontrar dados do usuário ou histórico para ${message.from} para adicionar a mensagem.`);
        }


        // Enviar a mensagem recebida do WhatsApp para a conversa correspondente no Chatwoot
        if (conversationId) {
            await enviarMensagemChatwoot(conversationId, message.body);
        } else {
             console.error(`Não há ID de conversa Chatwoot para ${message.from}. Não foi possível encaminhar a mensagem.`);
        }

        // ==================================================================
        // AQUI ENTRARIA A LÓGICA PARA RESPONDER AO USUÁRIO (se necessário)
        // ==================================================================
        // Exemplo: Se quisesse responder 'Olá' com 'Oi, tudo bem?'
        /*
        if (message.body.toLowerCase() === 'olá') {
            const resposta = 'Oi, tudo bem?';
            await client.sendText(message.from, resposta);
            console.log(`Resposta enviada para ${message.from}: "${resposta}"`);

            // Enviar também a resposta do bot para o Chatwoot
             if (conversationId) {
                 // Implementar uma função similar a enviarMensagemChatwoot, mas com message_type: 'outgoing'
                 // await enviarMensagemSaindoChatwoot(conversationId, resposta);
            }
        }
        */

        // Se você for integrar com LLaMA 3 ou outra IA:
        // 1. Pegue o histórico do usuário (userData.historico)
        // 2. Envie para a API da IA junto com a mensagem atual (message.body) e o prompt (treinamento)
        // 3. Receba a resposta da IA
        // 4. Envie a resposta da IA para o WhatsApp (client.sendText)
        // 5. Adicione a resposta da IA ao histórico (userData.historico.push('bot:' + respostaIA))
        // 6. Envie a resposta da IA para o Chatwoot (com message_type: 'outgoing')

    });

    // Listener para mudança de estado da conexão do WhatsApp
    client.onStateChange((state) => {
        console.log('🔄 Estado da conexão do cliente mudou:', state);
        // Tenta reconectar se houver conflito (outra sessão aberta) ou se deslançar
        if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
            console.log("Tentando reconectar usando useHere()...");
            client.useHere();
        }
        // Apenas loga se desconectado (pode ser manual ou perda de conexão)
        if (state === 'UNPAIRED' || state === 'DISCONNECTED') {
            console.log('Cliente desconectado.');
             // Aqui você pode adicionar lógica para tentar recriar o cliente ou notificar um admin
        }
    });

     // Listener para o estado do stream (conexão websocket com o WhatsApp)
     client.onStreamChange((state) => {
         console.log('🌊 Estado do Stream mudou:', state);
          if (state === 'DISCONNECTED' || state === 'SYNCING') {
               // Pode indicar problemas de conexão
               console.warn("Stream desconectado ou sincronizando...");
          }
     });

}

// Captura de erros não tratados no processo Node.js (boa prática)
process.on('uncaughtException', (error, origin) => {
    console.error(`💥 Erro não capturado: ${error.message}`);
    console.error(`Origem: ${origin}`);
    console.error(error.stack);
    // Considerar encerrar de forma limpa ou reiniciar o processo
    // process.exit(1);
});

// Captura de rejeições de Promises não tratadas (boa prática)
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚫 Rejeição de Promise não tratada:');
    console.error('Motivo:', reason);
    // console.error('Promise:', promise); // Pode gerar muito log
     // Considerar encerrar de forma limpa ou reiniciar o processo
     // process.exit(1);
});

console.log("Iniciando script do bot...");