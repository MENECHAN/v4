const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config.json');
const User = require('../models/User');
const Account = require('../models/Account');
const Cart = require('../models/Cart');
const OrderLog = require('../models/OrderLog');
const TicketService = require('../services/ticketService');
const CartService = require('../services/cartService');
const PriceManagerHandler = require('../handlers/priceManagerHandler');
const FriendshipService = require('../services/friendshipService');
const fs = require('fs');
const OrderService = require('../services/orderService');




module.exports = {
    async handle(interaction) {
        console.log(`[DEBUG] Button interaction received: ${interaction.customId}`);

        const [action, ...params] = interaction.customId.split('_');
        console.log(`[DEBUG] Parsed action: ${action}, params:`, params);

        if (action === 'select' && params[0] === 'region') {
            await handleRegionSelection(interaction);
            return;
        } else if (action === 'open' && params[0] === 'cart' && params[1] === 'region') {
            
            await handleOpenCartWithRegion(interaction);
            return;
        } else if (action === 'confirm' && params[0] === 'region') {
            
            const region = params[1];
            const originalButtonId = params.slice(2).join('_');
            await handleConfirmRegion(interaction, region, originalButtonId);
            return;
        }

        
        if (action === 'approve' && params[0] === 'order') {
            const orderId = params[1];
            console.log(`[DEBUG] Approve order button clicked for order ${orderId}`);
            await OrderService.approveOrder(interaction, orderId);
            return;
        }

        if (action === 'reject' && params[0] === 'order') {
            const orderId = params[1];
            console.log(`[DEBUG] Reject order button clicked for order ${orderId}`);
            await OrderService.rejectOrder(interaction, orderId);
            return;
        }

        
        if (action === 'select' && params[0] === 'account') {
            
            const orderId = params[1];
            const accountId = params[2];
            console.log(`[DEBUG ButtonHandler] Account selection via button: Order ${orderId}, Account ${accountId}`);

            try {
                await OrderService.processAccountSelection(interaction, orderId, accountId);
            } catch (error) {
                console.error('[ERROR ButtonHandler] Account selection error:', error);
                await interaction.reply({
                    content: '❌ Erro ao processar seleção de conta.',
                    ephemeral: true
                });
            }
            return;
        }

        
        if (action === 'edit' && params[0] === 'price') {
            await PriceManagerHandler.handlePriceButton(interaction);
            return;
        }
        if (action === 'search' && params[0] === 'item') {
            await PriceManagerHandler.handleSearchButton(interaction);
            return;
        }

        
        if (action === 'approve' && params[0] === 'friendship') {
            await FriendshipService.approveFriendship(interaction, params[1]);
            return;
        }
        if (action === 'reject' && params[0] === 'friendship') {
            await FriendshipService.rejectFriendship(interaction, params[1]);
            return;
        }
        if (action === 'friendship' && params[0] === 'info') {
            await FriendshipService.showFriendshipInfo(interaction, params[1]);
            return;
        }

        
        if (action === 'confirm' && params[0] === 'checkout' && params[1] && params[2]) {
            const cartId = params[1];
            const accountId = params[2];
            console.log(`[DEBUG] Confirm checkout with account: Cart ${cartId}, Account ${accountId}`);
            await handleConfirmCheckoutWithAccount(interaction, cartId, accountId);
            return;
        }

        
        switch (action) {
            case 'open':
                if (params[0] === 'cart') {
                    await handleOpenCart(interaction);
                }
                break;

            case 'add':
                if (params[0] === 'account') {
                    await handleAddAccount(interaction);
                } else if (params[0] === 'friend') {
                    await handleAddFriend(interaction, params[1]);
                } else if (params[0] === 'item') {
                    console.log(`[DEBUG] Calling handleAddItem with cartId: ${params[1]}`);
                    await handleAddItem(interaction, params[1]);
                }
                break;

            case 'remove':
                if (params[0] === 'item') {
                    await handleRemoveItem(interaction, params[1]);
                }
                break;

            case 'close':
                if (params[0] === 'account' && params[1] === 'ticket') {
                    await handleCloseAccountTicket(interaction);
                } else if (params[0] === 'cart') {
                    await handleCloseCart(interaction, params[1]);
                }
                break;

            case 'confirm':
                console.log(`[DEBUG] Confirm action with params:`, params);
                if (params[0] === 'close') {
                    await CartService.handleCloseCart(interaction, params[1]);
                } else if (params[0] === 'add') {
                    console.log(`[DEBUG] Calling handleConfirmAddItem with cartId: ${params[1]}, itemId: ${params[2]}`);
                    await handleConfirmAddItem(interaction, params[1], params[2]);
                } else if (params[0] === 'checkout') {
                    
                    if (params.length === 2) {
                        await handleConfirmCheckout(interaction, params[1]);
                    }
                }
                break;

            case 'cancel':
                if (params[0] === 'close') {
                    await handleCancelClose(interaction);
                }
                break;

            case 'back':
                if (params[0] === 'cart') {
                    await handleBackToCart(interaction, params[1]);
                } else if (params[0] === 'items') {
                    await handleBackToItems(interaction, params[1], params[2], params[3]);
                }
                break;

            case 'checkout':
                const checkoutCartId = params[0];
                await handleCheckout(interaction, checkoutCartId);
                break;

            case 'payment':
                if (params[0] === 'proof' && params[1] === 'sent') {
                    const proofOrderId = params[3];
                    await OrderService.handleClientSentProof(interaction, proofOrderId);
                }
                break;

            case 'items':
                if (params[0] === 'page') {
                    await handleItemsPage(interaction, params[1], params[2], params[3]);
                }
                break;

            case 'searchpage':
                await handleSearchPageSimple(interaction, params[1], params[2], params[3]);
                break;

            case 'search':
                if (params[0] === 'more') {
                    await handleSearchMore(interaction, params[1]);
                } else if (params[0] === 'category') {
                    
                    const cartId = params[1];
                    const category = params.slice(2).join('_');
                    console.log(`[DEBUG] Search category button - cartId: ${cartId}, category: ${category}`);
                    await handleCategorySearch(interaction, cartId, category);
                } else if (params[0] === 'result' && params[1] === 'page') {
                    
                    const cartId = params[2];
                    const categoryParts = [];
                    let pageIndex = -1;

                    
                    for (let i = 3; i < params.length; i++) {
                        if (!isNaN(parseInt(params[i]))) {
                            pageIndex = i;
                            break;
                        }
                        categoryParts.push(params[i]);
                    }

                    if (pageIndex !== -1 && pageIndex + 1 < params.length) {
                        const category = categoryParts.join('_');
                        const page = params[pageIndex];
                        const encodedQuery = params[pageIndex + 1];
                        await handleSearchResultPage(interaction, cartId, category, page, encodedQuery);
                    }
                }
                break;

            default:
                console.log(`[DEBUG] No handler found for action: ${action} with params:`, params);
                break;
        }
    }
};


async function handleSearchPageSimple(interaction, cartId, page, encodedData) {
    try {
        await interaction.deferUpdate();

        const data = JSON.parse(Buffer.from(encodedData, 'base64').toString());
        const { category, query } = data;

        await CartService.handleSearchInCategory(interaction.channel, cartId, category, query, parseInt(page));
    } catch (error) {
        console.error('Error handling search page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}

async function handleConfirmCheckoutWithAccount(interaction, cartId, accountId) {
    try {
        console.log(`[DEBUG] handleConfirmCheckoutWithAccount started with cartId: ${cartId}, accountId: ${accountId}`);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        
        const Cart = require('../models/Cart');
        const Account = require('../models/Account');
        const User = require('../models/User');
        const Friendship = require('../models/Friendship');

        const cart = await Cart.findById(cartId);
        const account = await Account.findById(accountId);
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
        const friendship = await Friendship.findByUserAndAccount(user.id, accountId);

        if (!cart || !account || !friendship) {
            return await interaction.editReply({
                content: '❌ Erro ao encontrar informações necessárias.'
            });
        }

        
        const FriendshipService = require('../services/friendshipService');
        const eligibility = await FriendshipService.canSendGifts(user.id, accountId);

        if (!eligibility.canSend) {
            return await interaction.editReply({
                content: `❌ Esta conta não é mais elegível para presentes.\n${eligibility.reason}`
            });
        }

        const items = await Cart.getItems(cartId);
        if (items.length === 0) {
            return await interaction.editReply({ content: '❌ Carrinho vazio.' });
        }

        const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
        const totalPrice = totalRP * 0.01;

        const itemsData = items.map(item => ({
            id: item.original_item_id || item.id,
            name: item.skin_name,
            price: item.skin_price,
            category: item.category || 'OTHER'
        }));

        console.log(`[DEBUG] About to create order with account selection...`);

        let orderId;

        try {
            
            const OrderLog = require('../models/OrderLog');
            const userIdToUse = interaction.user.id;

            
            const db = require('../database/connection');
            const manualQuery = `
                INSERT INTO order_logs (
                    user_id, cart_id, items_data, total_rp, total_price, 
                    status, payment_proof_url, order_channel_id, selected_account_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `;

            const manualResult = await db.run(manualQuery, [
                interaction.user.id,
                cartId,
                JSON.stringify(itemsData),
                totalRP,
                totalPrice,
                'PENDING_PAYMENT_PROOF',
                null,
                interaction.channel.id,
                accountId 
            ]);

            orderId = manualResult.lastID;
            console.log(`[DEBUG] Order created successfully with ID: ${orderId} and selected account: ${accountId}`);

        } catch (createError) {
            console.error(`[ERROR] Order creation failed:`, createError);
            throw new Error(`Failed to create order: ${createError.message}`);
        }

        if (!orderId) {
            throw new Error('Order ID not generated');
        }

        
        await Cart.updateStatus(cartId, 'pending_payment');

        
        const config = require('../config.json');
        let paymentMethods = '';

        if (config.paymentMethods?.paypal?.instructions) {
            paymentMethods += `**💳 PayPal:**\n${config.paymentMethods.paypal.instructions}\n\n`;
        }

        if (config.paymentMethods?.crypto?.instructions) {
            paymentMethods += `**🔗 Crypto:**\n${config.paymentMethods.crypto.instructions}\n\n`;
        }

        if (config.paymentMethods?.bank?.instructions) {
            paymentMethods += `**🏦 Bank Transfer:**\n${config.paymentMethods.bank.instructions}\n\n`;
        }

        if (!paymentMethods) {
            paymentMethods = 'Entre em contato com o suporte para informações de pagamento.';
        }

        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Pedido Criado com Sucesso!')
            .setDescription(
                `**🆔 ID do Pedido:** \`${orderId}\`\n` +
                `**🎮 Conta de destino:** ${account.nickname}\n` +
                `**👤 Seu nick:** ${friendship.lol_nickname}#${friendship.lol_tag}\n` +
                `**💎 Total RP:** ${totalRP.toLocaleString()}\n` +
                `**💰 Total EUR:** €${totalPrice.toFixed(2)}\n\n` +
                `**📝 Próximos passos:**\n` +
                `1️⃣ Realize o pagamento usando um dos métodos abaixo\n` +
                `2️⃣ **Envie a imagem do comprovante** neste canal\n` +
                `3️⃣ Aguarde nossa aprovação\n` +
                `4️⃣ Receba os itens na conta **${account.nickname}**`
            )
            .addFields([
                {
                    name: '💳 Métodos de Pagamento',
                    value: paymentMethods.length > 1024 ? paymentMethods.substring(0, 1021) + '...' : paymentMethods,
                    inline: false
                },
                {
                    name: '📦 Itens do Pedido',
                    value: items.map((item, index) =>
                        `${index + 1}. **${item.skin_name}** - ${item.skin_price.toLocaleString()} RP`
                    ).join('\n'),
                    inline: false
                },
                {
                    name: '🎮 Informações da Conta',
                    value:
                        `**Conta:** ${account.nickname}\n` +
                        `**Seu nick LoL:** ${friendship.lol_nickname}#${friendship.lol_tag}\n` +
                        `**RP disponível:** ${account.rp_amount.toLocaleString()}\n` +
                        `**Amigos há:** ${eligibility.daysSinceFriendship} dia(s)`,
                    inline: false
                }
            ])
            .setColor('#00ff00')
            .setFooter({ text: `Pedido ID: ${orderId} | Conta: ${account.nickname}` })
            .setTimestamp();

        await interaction.editReply({
            content: `✅ **Pedido criado com sucesso!**`,
            embeds: [successEmbed]
        });

        
        await interaction.channel.send({
            content: `🛒 **Pedido criado por ${interaction.user}**`,
            embeds: [successEmbed]
        });

        console.log(`[DEBUG] handleConfirmCheckoutWithAccount completed successfully`);

    } catch (error) {
        console.error('[ERROR] Error in handleConfirmCheckoutWithAccount:', error);

        try {
            await interaction.editReply({
                content: `❌ Erro ao criar pedido: ${error.message}`
            });
        } catch (replyError) {
            console.error('[ERROR] Error sending error message:', replyError);
        }
    }
}


async function handleSearchResultPage(interaction, cartId, category, page, encodedQuery) {
    try {
        await interaction.deferUpdate();

        const searchQuery = decodeURIComponent(encodedQuery);
        console.log('handleSearchResultPage:', { cartId, category, page, searchQuery }); 

        await CartService.handleSearchInCategory(interaction.channel, cartId, category, searchQuery, parseInt(page));
    } catch (error) {
        console.error('Error handling search result page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}



async function handleSearchPage(interaction, cartId, category, page, encodedQuery) {
    try {
        await interaction.deferUpdate();

        const searchQuery = decodeURIComponent(encodedQuery);
        await CartService.handleSearchInCategory(interaction.channel, cartId, category, searchQuery, parseInt(page));
    } catch (error) {
        console.error('Error handling search page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}

async function handleOpenCartWithRegion(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('🌎 Selecione uma Região')
            .setDescription('**Escolha a região para seu carrinho:**\n\n' +
                'A região selecionada determinará quais contas estarão disponíveis para você.')
            .setColor('#5865f2')
            .setTimestamp();

        
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_region_BR_open_cart`)
                    .setLabel('Brasil')
                    .setEmoji('🇧🇷')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`confirm_region_NA_open_cart`)
                    .setLabel('América do Norte')
                    .setEmoji('🇺🇸')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`confirm_region_EUW_open_cart`)
                    .setLabel('Europa Oeste')
                    .setEmoji('🇪🇺')
                    .setStyle(ButtonStyle.Primary)
            );

        
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_region_EUNE_open_cart`)
                    .setLabel('Europa Nórdica')
                    .setEmoji('🇪🇺')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`confirm_region_LAS_open_cart`)
                    .setLabel('América Latina Sul')
                    .setEmoji('🇦🇷')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`confirm_region_LAN_open_cart`)
                    .setLabel('América Latina Norte')
                    .setEmoji('🇲🇽')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [row1, row2]
        });

    } catch (error) {
        console.error('Error handling region selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar seleção de região.',
            ephemeral: true
        });
    }
}

async function handleConfirmRegion(interaction, region, originalButtonId) {
    try {
        await interaction.deferUpdate();

        console.log(`[DEBUG] Region selected: ${region} for action: ${originalButtonId}`);

        
        if (originalButtonId === 'open_cart') {
            
            await handleOpenCartWithSelectedRegion(interaction, region);
        } else {
            
            console.log(`[DEBUG] Unhandled original button: ${originalButtonId}`);
            await interaction.followUp({
                content: '❌ Ação não implementada para esta região.',
                ephemeral: true
            });
        }

    } catch (error) {
        console.error('Error handling region confirmation:', error);
        await interaction.followUp({
            content: '❌ Erro ao confirmar região.',
            ephemeral: true
        });
    }
}

async function handleOpenCartWithSelectedRegion(interaction, region) {
    try {
        // Primeiro, garantir que o usuário existe
        const User = require('../models/User');
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
        console.log(`[DEBUG] User found/created:`, user);

        // Buscar carrinho ativo pelo ID do banco de dados do usuário
        const Cart = require('../models/Cart');
        let cart = await Cart.findActiveByUserId(user.id);
        console.log(`[DEBUG] Active cart found:`, cart ? `ID ${cart.id}` : 'None');

        if (cart) {
            // Verificar se o canal do carrinho ainda existe
            const existingChannel = interaction.guild.channels.cache.get(cart.ticket_channel_id);
            if (existingChannel) {
                return await interaction.followUp({
                    content: `❌ Você já tem um carrinho ativo em ${existingChannel}`,
                    ephemeral: true
                });
            } else {
                // Se o canal não existir mais, excluir o carrinho
                await Cart.delete(cart.id);
                cart = null;
            }
        }

        // Criar canal de ticket
        const TicketService = require('../services/ticketService');
        const ticketChannel = await TicketService.createTicket(interaction.guild, interaction.user, region);

        // Criar carrinho com o ID do banco de dados do usuário
        cart = await Cart.create(user.id, ticketChannel.id, region);
        console.log(`[DEBUG] New cart created with ID: ${cart.id} and region: ${region}`);

        // Enviar APENAS o embed do carrinho - remova a linha de boas-vindas para evitar duplicação
        const CartService = require('../services/cartService');
        await CartService.sendCartEmbed(ticketChannel, cart);

        await interaction.followUp({
            content: `✅ Carrinho criado na região **${region}**! Acesse ${ticketChannel}`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error opening cart with region:', error);
        console.error('Error details:', error.stack);

        await interaction.followUp({
            content: '❌ Erro ao abrir carrinho com região selecionada.',
            ephemeral: true
        });
    }
}

async function handleOpenCart(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        console.log(`[DEBUG] Opening cart for user: ${interaction.user.id}`);

        
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
        console.log(`[DEBUG] User found/created:`, user);

        
        let cart = await Cart.findActiveByUserId(interaction.user.id);
        console.log(`[DEBUG] Active cart found:`, cart ? `ID ${cart.id}` : 'None');

        if (cart) {
            
            const existingChannel = interaction.guild.channels.cache.get(cart.ticket_channel_id);
            if (existingChannel) {
                return await interaction.editReply({
                    content: `❌ Você já tem um carrinho ativo em ${existingChannel}`
                });
            } else {
                
                await Cart.delete(cart.id);
                cart = null;
            }
        }

        
        const ticketChannel = await TicketService.createTicket(interaction.guild, interaction.user);

        
        cart = await Cart.create(interaction.user.id, ticketChannel.id);
        console.log(`[DEBUG] New cart created with ID: ${cart.id}`);

        
        await CartService.sendCartEmbed(ticketChannel, cart);

        await interaction.editReply({
            content: `✅ Carrinho criado! Acesse ${ticketChannel}`
        });
    } catch (error) {
        console.error('Error opening cart:', error);
        console.error('Error details:', error.stack);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Erro ao abrir carrinho.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Erro ao abrir carrinho.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

async function handleAddAccount(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        
        let region = null;
        if (interaction.channelId) {
            
            const Cart = require('../models/Cart');
            const cart = await Cart.findByChannelId(interaction.channelId);
            if (cart && cart.region) {
                region = cart.region;
                console.log(`[DEBUG] Detected cart with region: ${region}`);
            }
        }

        
        const tempChannel = await interaction.guild.channels.create({
            name: `account-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                }
            ]
        });

        
        let accounts;
        if (region) {
            
            accounts = await Account.findAvailableByRegion(region);
            console.log(`[DEBUG] Found ${accounts.length} accounts in region ${region}`);
        } else {
            
            accounts = await Account.findAvailable();
            console.log(`[DEBUG] Found ${accounts.length} accounts in all regions`);
        }

        if (accounts.length === 0) {
            await tempChannel.delete();
            return await interaction.editReply({
                content: region ? 
                    `❌ Nenhuma conta disponível na região ${region} no momento.` : 
                    '❌ Nenhuma conta disponível no momento.'
            });
        }

        
        const accountsByRegion = {};
        accounts.forEach(account => {
            const accRegion = account.region || 'Desconhecida';
            if (!accountsByRegion[accRegion]) {
                accountsByRegion[accRegion] = [];
            }
            accountsByRegion[accRegion].push(account);
        });

        
        const embed = new EmbedBuilder()
            .setTitle('👥 Selecione uma Conta')
            .setDescription(
                `**Escolha uma conta para adicionar como amigo:**\n\n` +
                `Clique no botão "Add Friend" da conta desejada.\n\n` +
                (region ? `🌎 **Mostrando contas da região: ${region}**` : '🌎 **Contas de todas as regiões**')
            )
            .setColor('#5865f2')
            .setTimestamp();

        
        for (const [regionKey, regionAccounts] of Object.entries(accountsByRegion)) {
            const accountDetails = regionAccounts.map(acc => 
                `**${acc.nickname}**\n` +
                `💎 ${acc.rp_amount.toLocaleString()} RP | 👥 Amigos: ${acc.friends_count}/${acc.max_friends}`
            ).join('\n\n');
            
            embed.addFields([{
                name: `🌎 Região: ${regionKey}`,
                value: accountDetails,
                inline: false
            }]);
        }

        // Create buttons for each account
        const rows = [];
        for (const [regionKey, regionAccounts] of Object.entries(accountsByRegion)) {
            let components = [];
            
            for (let i = 0; i < regionAccounts.length; i++) {
                const account = regionAccounts[i];
                
                
                if (account.friends_count >= account.max_friends) continue;

                components.push(
                    new ButtonBuilder()
                        .setCustomId(`add_friend_${account.id}`)
                        .setLabel(`${account.nickname} (${regionKey})`)
                        .setStyle(ButtonStyle.Primary)
                );

                if (components.length === 5 || i === regionAccounts.length - 1) {
                    if (components.length > 0) {
                        rows.push(new ActionRowBuilder().addComponents(components));
                        components = [];
                    }
                }
            }
        }

        
        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_account_ticket')
                    .setLabel('🔒 Fechar Canal')
                    .setStyle(ButtonStyle.Danger)
            );

        rows.push(closeButton);

        await tempChannel.send({
            embeds: [embed],
            components: rows
        });

        
        setTimeout(async () => {
            try {
                if (tempChannel && !tempChannel.deleted) {
                    await tempChannel.delete();
                }
            } catch (error) {
                console.error('Error deleting temp channel:', error);
            }
        }, 600000);

        await interaction.editReply({
            content: `✅ Canal criado! Acesse ${tempChannel} para selecionar uma conta.`
        });
    } catch (error) {
        console.error('Error handling add account:', error);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Erro ao processar solicitação.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Erro ao processar solicitação.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

async function handleAddFriend(interaction, accountId) {
    try {
        
        const account = await Account.findById(accountId);

        if (!account) {
            return await interaction.reply({
                content: '❌ Conta não encontrada.',
                ephemeral: true
            });
        }

        if (account.friends_count >= account.max_friends) {
            return await interaction.reply({
                content: '❌ Esta conta já atingiu o limite máximo de amigos.',
                ephemeral: true
            });
        }

        
        const modal = new ModalBuilder()
            .setCustomId(`lol_nickname_modal_${accountId}`)
            .setTitle(`Adicionar ${account.nickname} (${account.region || 'Região não definida'})`);

        const nicknameInput = new TextInputBuilder()
            .setCustomId('lol_nickname')
            .setLabel('Nick do League of Legends (nick#tag)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Exemplo: Player#BR1')
            .setRequired(true)
            .setMaxLength(50);

        const firstActionRow = new ActionRowBuilder().addComponents(nicknameInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error handling add friend:', error);
        await interaction.reply({
            content: '❌ Erro ao processar solicitação.',
            ephemeral: true
        });
    }
}

async function handleAddItem(interaction, cartId) {
    try {
        console.log(`[DEBUG] handleAddItem called with cartId: ${cartId}`);
        await interaction.deferUpdate();

        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart found in handleAddItem:`, cart ? `ID: ${cart.id}, Status: ${cart.status}` : 'Not found');

        if (!cart) {
            console.log(`[DEBUG] Cart not found, sending error`);
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        console.log(`[DEBUG] About to call sendCategorySelectEmbed`);

        
        await CartService.sendCategorySelectEmbed(interaction.channel, cartId);

        console.log(`[DEBUG] sendCategorySelectEmbed completed successfully`);

    } catch (error) {
        console.error('[ERROR] Error handling add item:', error);
        console.error('[ERROR] Stack trace:', error.stack);

        try {
            await interaction.followUp({
                content: '❌ Erro ao processar solicitação.',
                ephemeral: true
            });
        } catch (followUpError) {
            console.error('[ERROR] Error sending followUp:', followUpError);
        }
    }
}

async function handleRemoveItem(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        const cartItems = await Cart.getItems(cartId);

        if (cartItems.length === 0) {
            return await interaction.followUp({
                content: '❌ Seu carrinho está vazio.',
                ephemeral: true
            });
        }

        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`remove_item_select_${cartId}`)
            .setPlaceholder('Selecione um item para remover')
            .addOptions(
                cartItems.map(item => ({
                    label: item.skin_name,
                    description: `${item.skin_price} RP - ${(item.skin_price * 0.01).toFixed(2)}€`,
                    value: item.id.toString()
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Remover Item')
            .setDescription('Selecione o item que deseja remover do carrinho:')
            .setColor('#ed4245')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error handling remove item:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar solicitação.',
            ephemeral: true
        });
    }
}

async function handleCloseCart(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        
        await CartService.sendCloseCartConfirmation(interaction.channel, cartId);
    } catch (error) {
        console.error('Error handling close cart:', error);
        await interaction.followUp({
            content: '❌ Erro ao fechar carrinho.',
            ephemeral: true
        });
    }
}

async function handleConfirmAddItem(interaction, cartId, itemId) {
    try {
        console.log(`[DEBUG] handleConfirmAddItem called with cartId: ${cartId}, itemId: ${itemId}`);
        await interaction.deferUpdate();

        
        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart found:`, cart ? `ID ${cart.id}` : 'No cart found');

        if (!cart) {
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        
        let catalog = [];
        if (fs.existsSync('./catalog.json')) {
            catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
        } else {
            console.log(`[DEBUG] Catalog file not found`);
            return await interaction.followUp({
                content: '❌ Catálogo não encontrado.',
                ephemeral: true
            });
        }

        
        const item = catalog.find(i => i.id == itemId);
        console.log(`[DEBUG] Item found in catalog:`, item ? `${item.name} (${item.price} RP)` : 'No item found');

        if (!item) {
            return await interaction.followUp({
                content: '❌ Item não encontrado no catálogo.',
                ephemeral: true
            });
        }

        
        const existingItem = await Cart.findItemInCart(cartId, itemId);
        console.log(`[DEBUG] Existing item in cart:`, existingItem ? 'Found duplicate' : 'No duplicate');

        if (existingItem) {
            return await interaction.followUp({
                content: '❌ Este item já está no seu carrinho.',
                ephemeral: true
            });
        }

        
        let category = item.inventoryType || 'OTHER';
        if (item.subInventoryType === 'RECOLOR') {
            category = 'CHROMA';
        } else if (item.subInventoryType === 'CHROMA_BUNDLE') {
            category = 'CHROMA_BUNDLE';
        }
        console.log(`[DEBUG] Item category determined: ${category}`);

        
        console.log(`[DEBUG] Adding item to cart...`);
        const addResult = await Cart.addItem(
            cartId,
            item.name,
            item.price,
            item.splashArt || item.iconUrl || null,
            category,
            itemId
        );
        console.log(`[DEBUG] Item added with ID: ${addResult}`);

        
        const updatedCart = await Cart.findById(cartId);
        await CartService.sendCartEmbed(interaction.channel, updatedCart);

        await interaction.followUp({
            content: `✅ **${item.name}** adicionado ao carrinho!`,
            ephemeral: true
        });

        console.log(`[DEBUG] Item successfully added and cart updated`);

    } catch (error) {
        console.error('[ERROR] Error confirming add item:', error);
        console.error('[ERROR] Stack trace:', error.stack);
        await interaction.followUp({
            content: `❌ Erro ao adicionar item: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleRegionSelection(interaction) {
    try {
        
        const embed = new EmbedBuilder()
            .setTitle('🌎 Selecione uma Região')
            .setDescription('**Escolha a região para seu pedido:**\n\n' +
                'A região selecionada determinará quais contas estarão disponíveis para você.')
            .setColor('#5865f2')
            .setTimestamp();

        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`select_region_BR_${interaction.customId}`) 
                    .setLabel('Brasil')
                    .setEmoji('🇧🇷')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`select_region_NA_${interaction.customId}`)
                    .setLabel('América do Norte')
                    .setEmoji('🇺🇸')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`select_region_EUW_${interaction.customId}`)
                    .setLabel('Europa Oeste')
                    .setEmoji('🇪🇺')
                    .setStyle(ButtonStyle.Primary)
            );

        
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`select_region_EUNE_${interaction.customId}`)
                    .setLabel('Europa Nórdica')
                    .setEmoji('🇪🇺')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`select_region_LAS_${interaction.customId}`)
                    .setLabel('América Latina Sul')
                    .setEmoji('🇦🇷')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`select_region_LAN_${interaction.customId}`)
                    .setLabel('América Latina Norte')
                    .setEmoji('🇲🇽')
                    .setStyle(ButtonStyle.Primary)
            );

        
        await interaction.reply({
            embeds: [embed],
            components: [row, row2],
            ephemeral: true 
        });

    } catch (error) {
        console.error('Error handling region selection:', error);
        await interaction.reply({
            content: '❌ Erro ao mostrar seleção de região.',
            ephemeral: true
        });
    }
}

async function handleCancelClose(interaction) {
    try {
        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('❌ Cancelado')
            .setDescription('Fechamento do carrinho cancelado.')
            .setColor('#5865f2')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: []
        });
    } catch (error) {
        console.error('Error handling cancel close:', error);
    }
}

async function handleBackToCart(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        const cart = await Cart.findById(cartId);
        if (!cart) {
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        await CartService.sendCartEmbed(interaction.channel, cart);
    } catch (error) {
        console.error('Error going back to cart:', error);
        await interaction.followUp({
            content: '❌ Erro ao voltar para o carrinho.',
            ephemeral: true
        });
    }
}

async function handleBackToItems(interaction, cartId, category, page) {
    try {
        await interaction.deferUpdate();

        await CartService.sendItemsEmbed(interaction.channel, cartId, category, parseInt(page));
    } catch (error) {
        console.error('Error going back to items:', error);
        await interaction.followUp({
            content: '❌ Erro ao voltar para os itens.',
            ephemeral: true
        });
    }
}

async function handleItemsPage(interaction, cartId, category, page) {
    try {
        await interaction.deferUpdate();
        await CartService.sendItemsEmbed(interaction.channel, cartId, category, parseInt(page));
    } catch (error) {
        console.error('Error changing items page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}

async function handleSearchMore(interaction, cartId) {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`search_items_modal_${cartId}`)
            .setTitle('Pesquisar Itens');

        const searchInput = new TextInputBuilder()
            .setCustomId('search_query')
            .setLabel('Buscar por nome, campeão ou categoria')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Yasuo, PROJECT, Epic...')
            .setRequired(true)
            .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder().addComponents(searchInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error handling search more:', error);
        await interaction.reply({
            content: '❌ Erro ao processar busca.',
            ephemeral: true
        });
    }
}

async function handleCategorySearch(interaction, cartId, category) {
    try {
        console.log(`[DEBUG] handleCategorySearch - cartId: ${cartId}, category: ${category}`);

        const modal = new ModalBuilder()
            .setCustomId(`search_category_modal_${cartId}_${category}`)
            .setTitle(`Pesquisar em ${CartService.getCategoryName(category)}`);

        const searchInput = new TextInputBuilder()
            .setCustomId('search_query')
            .setLabel('Buscar por nome, campeão ou palavra-chave')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Yasuo, PROJECT, Elementalist...')
            .setRequired(true)
            .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder().addComponents(searchInput);
        modal.addComponents(firstActionRow);

        console.log(`[DEBUG] About to show modal for category search`);
        await interaction.showModal(modal);
        console.log(`[DEBUG] Modal shown successfully`);

    } catch (error) {
        console.error('[ERROR] Error handling category search:', error);
        console.error('[ERROR] Stack trace:', error.stack);

        try {
            await interaction.reply({
                content: '❌ Erro ao processar busca.',
                ephemeral: true
            });
        } catch (replyError) {
            console.error('[ERROR] Error sending reply:', replyError);
        }
    }
}



async function handleCheckout(interaction, cartId) {
    try {
        console.log(`[DEBUG] handleCheckout called with cartId: ${cartId}`);

        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart lookup result:`, cart);

        if (!cart) {
            return await interaction.reply({
                content: '❌ Carrinho não encontrado. Tente abrir um novo carrinho.',
                ephemeral: true
            });
        }

        
        const validStatuses = ['active', 'pending_payment'];
        if (!validStatuses.includes(cart.status)) {
            return await interaction.reply({
                content: `❌ Este carrinho não pode ser usado para checkout. Status atual: ${cart.status}`,
                ephemeral: true
            });
        }

        const items = await Cart.getItems(cartId);
        console.log(`[DEBUG] Cart items count: ${items.length}`);

        if (items.length === 0) {
            return await interaction.reply({
                content: '❌ Seu carrinho está vazio. Adicione itens antes de fazer checkout.',
                ephemeral: true
            });
        }

        
        
        console.log(`[DEBUG] Skipping ownership check for now...`);

        
        await CartService.sendCheckoutEmbed(interaction, interaction.client, cartId);

    } catch (error) {
        console.error('Error handling checkout:', error);
        console.error('Error stack:', error.stack);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Erro ao processar checkout. Tente novamente.',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '❌ Erro ao processar checkout.',
                ephemeral: true
            });
        }
    }
}

async function handleConfirmCheckout(interaction, cartId) {
    try {
        console.log(`[DEBUG] handleConfirmCheckout started with cartId: ${cartId}`);
        console.log(`[DEBUG] User ID: ${interaction.user.id}`);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart found:`, cart ? `User: ${cart.user_id}` : 'No cart');

        if (!cart) {
            return await interaction.editReply({ content: '❌ Carrinho não encontrado.' });
        }

        const items = await Cart.getItems(cartId);
        if (items.length === 0) {
            return await interaction.editReply({ content: '❌ Carrinho vazio.' });
        }

        const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
        const totalPrice = totalRP * 0.01;

        const itemsData = items.map(item => ({
            id: item.original_item_id || item.id,
            name: item.skin_name,
            price: item.skin_price,
            category: item.category || 'OTHER'
        }));

        console.log(`[DEBUG] About to create order...`);

        let orderId;

        try {
            
            const userIdToUse = interaction.user.id; 
            console.log(`[DEBUG] Using Discord ID: ${userIdToUse}`);

            orderId = await Promise.race([
                OrderLog.create(
                    userIdToUse,        
                    cartId,
                    itemsData,
                    totalRP,
                    totalPrice,
                    'PENDING_PAYMENT_PROOF',
                    null,
                    interaction.channel.id
                ),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('OrderLog.create timeout')), 5000)
                )
            ]);
            console.log(`[DEBUG] OrderLog.create succeeded with ID: ${orderId}`);

        } catch (createError) {
            console.error(`[ERROR] OrderLog.create failed:`, createError);
            console.log(`[DEBUG] Trying manual database insert...`);

            try {
                const db = require('../database/connection');
                const manualQuery = `
                    INSERT INTO order_logs (
                        user_id, cart_id, items_data, total_rp, total_price, 
                        status, payment_proof_url, order_channel_id, 
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `;

                const manualResult = await db.run(manualQuery, [
                    interaction.user.id,  
                    cartId,
                    JSON.stringify(itemsData),
                    totalRP,
                    totalPrice,
                    'PENDING_PAYMENT_PROOF',
                    null,
                    interaction.channel.id
                ]);

                orderId = manualResult.lastID;
                console.log(`[DEBUG] Manual insert succeeded with ID: ${orderId}`);

            } catch (manualError) {
                console.error(`[ERROR] Manual insert also failed:`, manualError);
                throw new Error(`Failed to create order: ${manualError.message}`);
            }
        }


        if (!orderId) {
            throw new Error('Order ID not generated');
        }

        console.log(`[DEBUG] Order created successfully with ID: ${orderId}`);

        
        await Cart.updateStatus(cartId, 'pending_payment');

        
        const paymentMethods = Object.entries(config.paymentMethods || {})
            .map(([method, details]) =>
                `**${method.toUpperCase()}:**\n${details.instructions}`
            ).join('\n\n') || 'Métodos de pagamento não configurados';

        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Pedido Criado com Sucesso!')
            .setDescription(
                `**🆔 ID do Pedido:** \`${orderId}\`\n` +
                `**💎 Total RP:** ${totalRP.toLocaleString()}\n` +
                `**💰 Total EUR:** €${totalPrice.toFixed(2)}\n\n` +
                `**📝 Próximos passos:**\n` +
                `1️⃣ Realize o pagamento\n` +
                `2️⃣ **Envie a imagem do comprovante** neste canal\n` +
                `3️⃣ Aguarde nossa aprovação\n` +
                `4️⃣ Receba os itens na sua conta`
            )
            .addFields([
                {
                    name: '💳 Métodos de Pagamento',
                    value: paymentMethods,
                    inline: false
                },
                {
                    name: '📦 Itens do Pedido',
                    value: items.map((item, index) =>
                        `${index + 1}. **${item.skin_name}** - ${item.skin_price.toLocaleString()} RP`
                    ).join('\n'),
                    inline: false
                }
            ])
            .setColor('#00ff00')
            .setFooter({ text: `Pedido ID: ${orderId} | Carrinho ID: ${cartId}` })
            .setTimestamp();

        await interaction.editReply({
            content: `✅ **Pedido criado com sucesso!**`,
            embeds: [successEmbed]
        });

        
        await interaction.channel.send({
            content: `🛒 **Pedido criado por ${interaction.user}**`,
            embeds: [successEmbed]
        });

        console.log(`[DEBUG] handleConfirmCheckout completed successfully`);

    } catch (error) {
        console.error('[ERROR] Error in handleConfirmCheckout:', error);

        try {
            await interaction.editReply({
                content: `❌ Erro ao criar pedido: ${error.message}`
            });
        } catch (replyError) {
            console.error('[ERROR] Error sending error message:', replyError);
        }
    }

    
    

async function handleCloseAccountTicket(interaction) {
    try {
        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('🔒 Fechando Canal')
            .setDescription('Este canal será fechado em 5 segundos...')
            .setColor('#ed4245')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: []
        });

        
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (error) {
                console.error('Error deleting account channel:', error);
            }
        }, 5000);

    } catch (error) {
        console.error('Error closing account ticket:', error);
        await interaction.followUp({
            content: '❌ Erro ao fechar canal.',
            ephemeral: true
        });
    }
}

}