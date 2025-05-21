const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Cart = require('../models/Cart');
const OrderLog = require('../models/OrderLog'); 
const config = require('../config.json');
const fs = require('fs');

class CartService {
    static async sendCheckoutEmbed(interaction, client, cartId) {
        try {
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Starting with cartId: ${cartId}`);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);

            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: true });
            }

            
            const cart = await Cart.findById(cartId);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Cart retrieval:`, cart ? `Status: ${cart.status}, User: ${cart.user_id}, Region: ${cart.region}` : 'null');

            if (!cart) {
                const content = '❌ Carrinho não encontrado.';
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            
            const validStatuses = ['active', 'pending_payment'];
            if (!validStatuses.includes(cart.status)) {
                const content = `❌ Carrinho não pode ser usado para checkout. Status: ${cart.status}`;
                console.log(`[DEBUG CartService.sendCheckoutEmbed] ${content}`);
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            const items = await Cart.getItems(cartId);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Items retrieved: ${items.length}`);

            if (items.length === 0) {
                const content = '❌ Seu carrinho está vazio.';
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            
            const User = require('../models/User');
            const Friendship = require('../models/Friendship');
            const Account = require('../models/Account');

            
            const user = await User.findByDiscordId(interaction.user.id);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] User found:`, user ? `ID: ${user.id}` : 'null');

            if (!user) {
                const content = '❌ Usuário não encontrado no sistema. Use o botão "Add Account" primeiro.';
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            
            let clientFriendships = await Friendship.findByUserId(user.id);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Found ${clientFriendships.length} friendships initially`);

            
            if (cart.region) {
                console.log(`[DEBUG CartService.sendCheckoutEmbed] Filtering accounts by region: ${cart.region}`);
                const filteredFriendships = [];

                for (const friendship of clientFriendships) {
                    const account = await Account.findById(friendship.account_id);

                    
                    if (account && account.region === cart.region) {
                        filteredFriendships.push(friendship);
                    }
                }

                clientFriendships = filteredFriendships;
                console.log(`[DEBUG CartService.sendCheckoutEmbed] Filtered to ${clientFriendships.length} friendships in region ${cart.region}`);
            }

            if (clientFriendships.length === 0) {
                const noAccountsEmbed = new EmbedBuilder()
                    .setTitle(cart.region ?
                        `❌ Nenhuma Conta na Região ${cart.region}` :
                        '❌ Nenhuma Conta Adicionada')
                    .setDescription(
                        cart.region ?
                            `**Você não possui contas adicionadas na região ${cart.region}.**\n\n` +
                            '🎮 Para fazer pedidos nesta região, você precisa:\n' +
                            '1. Clicar em **"Add Account"** no painel principal\n' +
                            `2. Selecionar uma conta disponível na região **${cart.region}**\n` +
                            '3. Adicionar ela como amigo no LoL\n' +
                            '4. Aguardar aprovação\n\n' +
                            '💡 Você também pode criar um carrinho em outra região se preferir.' :
                            '**Você não possui contas adicionadas ao sistema.**\n\n' +
                            '🎮 Para fazer pedidos, você precisa:\n' +
                            '1. Clicar em **"Add Account"** no painel principal\n' +
                            '2. Selecionar uma conta disponível\n' +
                            '3. Adicionar ela como amigo no LoL\n' +
                            '4. Aguardar aprovação\n\n' +
                            '💡 Após adicionar contas, você poderá fazer checkout normalmente.'
                    )
                    .setColor('#ed4245')
                    .setTimestamp();

                return interaction.deferred ?
                    await interaction.editReply({ embeds: [noAccountsEmbed] }) :
                    await interaction.followUp({ embeds: [noAccountsEmbed], ephemeral: true });
            }

            
            const eligibleAccounts = [];
            const ineligibleAccounts = [];
            const minDays = config.orderSettings?.minFriendshipDays || 7;

            for (const friendship of clientFriendships) {
                const account = await Account.findById(friendship.account_id);

                if (!account) continue;

                
                const now = new Date();
                const addedAt = new Date(friendship.added_at);
                const daysSince = Math.floor((now - addedAt) / (1000 * 60 * 60 * 24));

                const accountData = {
                    ...account,
                    friendship_id: friendship.id,
                    lol_nickname: friendship.lol_nickname,
                    lol_tag: friendship.lol_tag,
                    days_since_added: daysSince,
                    days_remaining: Math.max(0, minDays - daysSince)
                };

                // ⭐ VERIFICAR SE TEM TEMPO SUFICIENTE (não verificar RP aqui, só tempo)
                if (daysSince >= minDays) {
                    eligibleAccounts.push(accountData);
                    console.log(`[DEBUG] Account ${account.nickname}: ✅ Eligible (${daysSince} days)`);
                } else {
                    ineligibleAccounts.push(accountData);
                    console.log(`[DEBUG] Account ${account.nickname}: ❌ Not eligible (${daysSince}/${minDays} days)`);
                }
            }

            // Calcular totais
            const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
            const totalPrice = totalRP * 0.01;

            console.log(`[DEBUG CartService.sendCheckoutEmbed] Totals: ${totalRP} RP, €${totalPrice}`);

            
            if (eligibleAccounts.length === 0) {
                let reasonsText = '';

                ineligibleAccounts.forEach(acc => {
                    reasonsText += `**${acc.nickname}** (${acc.lol_nickname}#${acc.lol_tag})\n` +
                        `⏳ Faltam ${acc.days_remaining} dias para poder receber presentes\n\n`;
                });

                const notEligibleEmbed = new EmbedBuilder()
                    .setTitle('⏰ Contas Não Elegíveis')
                    .setDescription(
                        `**Suas contas${cart.region ? ` na região ${cart.region}` : ''} ainda não podem receber presentes.**\n\n` +
                        `**Requisito:** Mínimo ${minDays} dias de amizade\n\n` +
                        `**Status das suas contas:**\n\n${reasonsText}` +
                        `💡 **Aguarde o tempo necessário e tente novamente.**`
                    )
                    .addFields([
                        {
                            name: '📦 Itens no Carrinho',
                            value: items.map((item, index) =>
                                `${index + 1}. **${item.skin_name}** - ${item.skin_price.toLocaleString()} RP`
                            ).join('\n'),
                            inline: false
                        },
                        {
                            name: '💰 Total',
                            value: `${totalRP.toLocaleString()} RP (€${totalPrice.toFixed(2)})`,
                            inline: true
                        }
                    ])
                    .setColor('#faa61a')
                    .setTimestamp();

                return interaction.deferred ?
                    await interaction.editReply({ embeds: [notEligibleEmbed] }) :
                    await interaction.followUp({ embeds: [notEligibleEmbed], ephemeral: true });
            }

            
            const selectOptions = eligibleAccounts.map(account => ({
                label: `${account.nickname} (${account.lol_nickname}#${account.lol_tag})`,
                description: `${account.days_since_added} dias de amizade | ${account.rp_amount.toLocaleString()} RP disponível`,
                value: account.id.toString(),
                emoji: '🎮'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_checkout_account_${cartId}`)
                .setPlaceholder('Selecione qual conta irá receber os presentes...')
                .addOptions(selectOptions);

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cartId}`)
                        .setLabel('◀️ Voltar ao Carrinho')
                        .setStyle(ButtonStyle.Secondary)
                );

            
            const checkoutEmbed = new EmbedBuilder()
                .setTitle('🛒 Checkout - Selecionar Conta de Destino')
                .setDescription(
                    `**Selecione qual das suas contas irá receber os presentes:**\n\n` +
                    `💡 Apenas contas com ${minDays}+ dias de amizade podem receber presentes.` +
                    (cart.region ? `\n🌎 **Região do carrinho: ${cart.region}**` : '')
                )
                .addFields([
                    {
                        name: '✅ Suas Contas Elegíveis',
                        value: eligibleAccounts.map(acc =>
                            `🎮 **${acc.nickname}** (${acc.lol_nickname}#${acc.lol_tag})\n` +
                            `⏰ ${acc.days_since_added} dias de amizade | 💎 ${acc.rp_amount.toLocaleString()} RP`
                        ).join('\n\n'),
                        inline: false
                    },
                    {
                        name: '📦 Itens no Carrinho',
                        value: items.map((item, index) =>
                            `${index + 1}. **${item.skin_name}** - ${item.skin_price.toLocaleString()} RP`
                        ).join('\n'),
                        inline: false
                    },
                    {
                        name: '💰 Total',
                        value: `**${totalRP.toLocaleString()} RP** (€${totalPrice.toFixed(2)})`,
                        inline: true
                    }
                ])
                .setColor('#57f287')
                .setFooter({ text: `Carrinho ID: ${cartId}${cart.region ? ` | Região: ${cart.region}` : ''}` })
                .setTimestamp();

            
            if (ineligibleAccounts.length > 0) {
                const ineligibleText = ineligibleAccounts.map(acc =>
                    `⏳ **${acc.nickname}** - Faltam ${acc.days_remaining} dias`
                ).join('\n');

                checkoutEmbed.addFields([
                    {
                        name: '❌ Contas Não Elegíveis',
                        value: ineligibleText,
                        inline: false
                    }
                ]);
            }

            console.log(`[DEBUG CartService.sendCheckoutEmbed] About to send checkout embed`);

            
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [checkoutEmbed],
                    components: [selectRow, backRow]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [checkoutEmbed],
                    components: [selectRow, backRow],
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    embeds: [checkoutEmbed],
                    components: [selectRow, backRow],
                    ephemeral: true
                });
            }

            console.log(`[DEBUG CartService.sendCheckoutEmbed] Account selection sent successfully`);

        } catch (error) {
            console.error('[ERROR CartService.sendCheckoutEmbed] Error:', error);
            console.error('[ERROR CartService.sendCheckoutEmbed] Stack:', error.stack);

            
            const errorContent = '❌ Erro ao processar checkout. Tente novamente.';

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorContent });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorContent, ephemeral: true });
                } else {
                    await interaction.followUp({ content: errorContent, ephemeral: true });
                }
            } catch (followUpError) {
                console.error('[ERROR CartService.sendCheckoutEmbed] FollowUp error:', followUpError);
            }
        }
    }

    static async sendCartEmbed(channel, cart) {
        try {
            
            const items = await Cart.getItems(cart.id);

            
            const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
            const totalPrice = totalRP * 0.01; 

            
            const embed = new EmbedBuilder()
                .setTitle('🛒 Seu Carrinho')
                .setColor('#5865f2')
                .setTimestamp();

            
            if (cart.region) {
                embed.setDescription(`**Região:** ${cart.region}`);
            }

            if (items.length === 0) {
                const description = cart.region ?
                    `**Região:** ${cart.region}\n\n**Seu carrinho está vazio**\n\nClique em "Add Item" para adicionar items ao seu carrinho.` :
                    '**Seu carrinho está vazio**\n\nClique em "Add Item" para adicionar items ao seu carrinho.';
                embed.setDescription(description);
            } else {
                let itemsList = '';
                items.forEach((item, index) => {
                    const emoji = this.getCategoryEmoji(item.category);
                    itemsList += `**${index + 1}.** ${emoji} ${item.skin_name}\n` +
                        `💎 ${item.skin_price.toLocaleString()} RP - ${(item.skin_price * 0.01).toFixed(2)}€\n\n`;
                });

                const regionText = cart.region ? `**Região:** ${cart.region}\n\n` : '';
                embed.setDescription(`${regionText}${itemsList}`);
                embed.addFields(
                    {
                        name: '💎 Total RP',
                        value: totalRP.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '💰 Total Preço',
                        value: `${totalPrice.toFixed(2)}€`,
                        inline: true
                    },
                    {
                        name: '📦 Itens',
                        value: items.length.toString(),
                        inline: true
                    }
                );
            }

            
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cart.id}`)
                        .setLabel('➕ Add Item')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`remove_item_${cart.id}`)
                        .setLabel('➖ Remove Item')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(items.length === 0),
                    new ButtonBuilder()
                        .setCustomId(`close_cart_${cart.id}`)
                        .setLabel('🔒 Close Cart')
                        .setStyle(ButtonStyle.Secondary)
                );

            const components = [row1];

            
            if (items.length > 0) {
                const row2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`checkout_${cart.id}`)
                            .setLabel('💳 Checkout')
                            .setStyle(ButtonStyle.Success)
                    );
                components.push(row2);
            }

            
            await Cart.updateTotals(cart.id, totalRP, totalPrice);

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.updateCartMessage(channel, embed, components, cart.id);

        } catch (error) {
            console.error('Error sending cart embed:', error);
            throw error;
        }
    }

    

    static async sendCategorySelectEmbed(channel, cartId) {
        try {
            console.log(`[DEBUG] sendCategorySelectEmbed called with cartId: ${cartId}`);

            
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
                console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
            } else {
                console.log(`[DEBUG] Catalog file not found at ./catalog.json`);
                
                const defaultCategories = {
                    'CHAMPION_SKIN': 0,
                    'CHAMPION': 0,
                    'WARD_SKIN': 0,
                    'SUMMONER_ICON': 0,
                    'EMOTE': 0
                };

                console.log(`[DEBUG] Using default categories`);
            }

            
            const categoryStats = {};
            catalog.forEach(item => {
                let category;

                
                if (item.subInventoryType === 'RECOLOR') {
                    category = 'CHROMA';
                }
                
                else if (item.subInventoryType === 'CHROMA_BUNDLE') {
                    category = 'CHROMA_BUNDLE';
                }
                
                else {
                    category = item.inventoryType || 'OTHER';
                }

                categoryStats[category] = (categoryStats[category] || 0) + 1;
            });

            console.log(`[DEBUG] Category stats:`, categoryStats);

            
            const allowedCategories = [
                'CHAMPION_SKIN',
                'CHAMPION',
                'WARD_SKIN',
                'SUMMONER_ICON',
                'EMOTE',
                'BUNDLES',
                'COMPANION',
                'TFT_MAP_SKIN',
                'TFT_DAMAGE_SKIN',
                'HEXTECH_CRAFTING',
                'CHROMA',
                'CHROMA_BUNDLE'
            ];

            
            const filteredCategoryStats = {};
            Object.entries(categoryStats).forEach(([category, count]) => {
                if (allowedCategories.includes(category)) {
                    filteredCategoryStats[category] = count;
                }
            });

            console.log(`[DEBUG] Filtered category stats:`, filteredCategoryStats);

            
            if (Object.keys(filteredCategoryStats).length === 0) {
                filteredCategoryStats['CHAMPION_SKIN'] = 0;
                console.log(`[DEBUG] No categories found, using default CHAMPION_SKIN`);
            }

            
            const embed = new EmbedBuilder()
                .setTitle('🏷️ Selecione uma Categoria')
                .setDescription('**Escolha uma categoria para navegar pelos itens:**\n\n' +
                    'Use o menu dropdown abaixo para selecionar o tipo de item que deseja adicionar.')
                .setColor('#5865f2')
                .setTimestamp();

            
            if (Object.keys(filteredCategoryStats).length > 0) {
                const statsText = Object.entries(filteredCategoryStats)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => `${this.getCategoryEmoji(category)} **${this.getCategoryName(category)}**`)
                    .join('\n');

                embed.addFields([{
                    name: '📊 Itens disponíveis',
                    value: statsText || 'Nenhum item disponível',
                    inline: false
                }]);
            }

            console.log(`[DEBUG] About to create select menu with ${Object.keys(filteredCategoryStats).length} categories`);

            
            const selectOptions = Object.entries(filteredCategoryStats)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 25) 
                .map(([category, count]) => ({
                    label: this.getCategoryName(category),
                    value: category,
                    emoji: this.getCategoryEmojiObject(category)
                }));

            console.log(`[DEBUG] Select options created:`, selectOptions);

            if (selectOptions.length === 0) {
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Nenhuma Categoria Disponível')
                    .setDescription('No momento não há itens disponíveis no catálogo.')
                    .setColor('#ed4245')
                    .setTimestamp();

                const backRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`back_cart_${cartId}`)
                            .setLabel('◀️ Voltar ao Carrinho')
                            .setStyle(ButtonStyle.Secondary)
                    );

                console.log(`[DEBUG] Sending error embed - no categories`);

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.updateCategoryMessage(channel, errorEmbed, [backRow], cartId);

                return;
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`category_select_${cartId}`)
                .setPlaceholder('Selecione uma categoria...')
                .addOptions(selectOptions);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cartId}`)
                        .setLabel('◀️ Voltar ao Carrinho')
                        .setStyle(ButtonStyle.Secondary)
                );

            console.log(`[DEBUG] About to send category select message`);

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.updateCategoryMessage(channel, embed, [row1, row2], cartId);

            console.log(`[DEBUG] Category select message sent successfully`);

        } catch (error) {
            console.error('[ERROR] Error sending category select embed:', error);
            console.error('[ERROR] Stack trace:', error.stack);

            
            try {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Erro ao Carregar Categorias')
                    .setDescription('Ocorreu um erro ao carregar as categorias. Tente novamente.')
                    .setColor('#ed4245')
                    .setTimestamp();

                const backRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`back_cart_${cartId}`)
                            .setLabel('◀️ Voltar ao Carrinho')
                            .setStyle(ButtonStyle.Secondary)
                    );

                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.forceNewMessage(channel, {
                    embeds: [errorEmbed],
                    components: [backRow]
                }, `error_${cartId}`);

            } catch (sendError) {
                console.error('[ERROR] Could not send error message:', sendError);
            }

            throw error;
        }
    }

    static async sendItemsEmbed(channel, cartId, category, page = 1) {
        try {
            console.log(`[DEBUG] sendItemsEmbed called with cartId: ${cartId}, category: ${category}, page: ${page}`);

            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
                console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
            } else {
                console.log(`[DEBUG] Catalog file not found`);
                return;
            }

            
            console.log(`[DEBUG] Filtering items for category: ${category}`);
            const allItems = catalog.filter(item => {
                let matchesCategory = false;

                if (category === 'CHROMA') {
                    matchesCategory = item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    matchesCategory = item.subInventoryType === 'CHROMA_BUNDLE';
                } else {
                    matchesCategory = item.inventoryType === category &&
                        item.subInventoryType !== 'RECOLOR' &&
                        item.subInventoryType !== 'CHROMA_BUNDLE';
                }

                
                const hasValidPrice = item.price && item.price > 0;

                return matchesCategory && hasValidPrice;
            });

            console.log(`[DEBUG] Found ${allItems.length} items after filtering category and price`);

            
            const uniqueItems = [];
            const seenNames = new Set();

            allItems.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                }
            });

            console.log(`[DEBUG] Found ${uniqueItems.length} unique items after removing duplicates`);

            if (uniqueItems.length === 0) {
                console.log(`[DEBUG] No items found, sending no items embed`);

                const embed = new EmbedBuilder()
                    .setTitle('❌ Nenhum Item Encontrado')
                    .setDescription(`Não há itens disponíveis na categoria **${this.getCategoryName(category)}**.`)
                    .setColor('#ed4245')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.updateItemsMessage(channel, embed, [row], cartId, category);
                return;
            }

            
            const needsPagination = uniqueItems.length > 10;
            const itemsPerPage = needsPagination ? 10 : uniqueItems.length;
            const totalPages = needsPagination ? Math.ceil(uniqueItems.length / itemsPerPage) : 1;
            const startIndex = needsPagination ? (page - 1) * itemsPerPage : 0;
            const endIndex = needsPagination ? startIndex + itemsPerPage : uniqueItems.length;
            const currentItems = uniqueItems.slice(startIndex, endIndex);

            console.log(`[DEBUG] Pagination: ${currentItems.length} items on page ${page}/${totalPages}`);

            
            const embed = new EmbedBuilder()
                .setTitle(`${this.getCategoryEmoji(category)} ${this.getCategoryName(category)}`)
                .setColor('#5865f2')
                .setTimestamp();
            const components = [];

            
            if (currentItems.length > 0) {
                const itemsForSelect = currentItems.slice(0, 25); 

                const selectOptions = itemsForSelect.map(item => ({
                    label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                    description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                    value: item.id.toString()
                }));

                console.log(`[DEBUG] Created ${selectOptions.length} select options`);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`item_select_${cartId}_${category}_${page}`)
                    .setPlaceholder('Selecione um item...')
                    .addOptions(selectOptions);

                components.push(new ActionRowBuilder().addComponents(selectMenu));

                
                if (currentItems.length > 25) {
                    embed.addFields([{
                        name: 'ℹ️ Nota',
                        value: `Mostrando os primeiros 25 itens desta página. Use os botões de navegação para ver mais.`,
                        inline: false
                    }]);
                }
            }

            
            if (needsPagination && totalPages > 1) {
                const navButtons = [];

                if (page > 1) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`items_page_${cartId}_${category}_${page - 1}`)
                            .setLabel('◀️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                navButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`search_category_${cartId}_${category}`)
                        .setLabel('🔍 Pesquisar')
                        .setStyle(ButtonStyle.Primary)
                );

                if (page < totalPages) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`items_page_${cartId}_${category}_${page + 1}`)
                            .setLabel('Próxima ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                if (navButtons.length > 0) {
                    components.push(new ActionRowBuilder().addComponents(navButtons));
                }
            } else {
                
                const searchButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`search_category_${cartId}_${category}`)
                            .setLabel('🔍 Pesquisar')
                            .setStyle(ButtonStyle.Primary)
                    );
                components.push(searchButton);
            }

            
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cartId}`)
                        .setLabel('🏷️ Voltar às Categorias')
                        .setStyle(ButtonStyle.Secondary)
                );
            components.push(backButton);

            console.log(`[DEBUG] Created ${components.length} component rows`);

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.updateItemsMessage(channel, embed, components, cartId, category);

            console.log(`[DEBUG] sendItemsEmbed completed successfully`);

        } catch (error) {
            console.error('[ERROR] Error sending items embed:', error);
            console.error('[ERROR] Stack trace:', error.stack);

            try {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Erro ao Carregar Itens')
                    .setDescription('Ocorreu um erro ao carregar os itens. Tente novamente.')
                    .setColor('#ed4245')
                    .setTimestamp();

                const backButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.forceNewMessage(channel, {
                    embeds: [errorEmbed],
                    components: [backButton]
                }, `error_${cartId}`);

            } catch (sendError) {
                console.error('[ERROR] Could not send error message:', sendError);
            }

            throw error;
        }
    }

    static async sendItemPreviewEmbed(channel, cartId, itemId) {
        try {
            console.log(`[DEBUG] sendItemPreviewEmbed called with cartId: ${cartId}, itemId: ${itemId}`);

            
            let catalog = [];
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            
            const item = catalog.find(i => i.id == itemId);
            console.log(`[DEBUG] Item found for preview:`, item ? item.name : 'Not found');

            if (!item) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Item Não Encontrado')
                    .setDescription('O item selecionado não foi encontrado no catálogo.')
                    .setColor('#ed4245');

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.updateItemPreviewMessage(channel, embed, [], cartId, itemId);
                return;
            }

            
            let category = item.inventoryType || 'OTHER';
            if (item.subInventoryType === 'RECOLOR') {
                category = 'CHROMA';
            } else if (item.subInventoryType === 'CHROMA_BUNDLE') {
                category = 'CHROMA_BUNDLE';
            }

            
            const embed = new EmbedBuilder()
                .setTitle('🎨 Preview do Item')
                .setDescription(`**${item.name}**\n\n` +
                    `${this.getCategoryEmoji(category)} **Categoria:** ${this.getCategoryName(category)}\n` +
                    `${item.champion ? `🏆 **Campeão:** ${item.champion}\n` : ''}` +
                    `💎 **Preço:** ${item.price.toLocaleString()} RP\n` +
                    `💰 **Valor:** ${(item.price * 0.01).toFixed(2)}€\n` +
                    `${item.rarity ? `✨ **Raridade:** ${item.rarity}\n` : ''}`)
                .setColor('#5865f2')
                .setTimestamp();

            
            const imageUrl = item.splashArt || item.splash_art || item.iconUrl;
            if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                if (item.splashArt || item.splash_art) {
                    embed.setImage(imageUrl);
                } else {
                    embed.setThumbnail(imageUrl);
                }
            }

            
            if (item.tags && item.tags.length > 0) {
                embed.addFields([{
                    name: '🏷️ Tags',
                    value: item.tags.slice(0, 10).join(', '),
                    inline: false
                }]);
            }

            
            const customId = `confirm_add_${cartId}_${itemId}`;
            console.log(`[DEBUG] Creating button with customId: ${customId}`);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(customId)
                        .setLabel('✅ Adicionar ao Carrinho')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`back_items_${cartId}_${category}_1`)
                        .setLabel('◀️ Voltar')
                        .setStyle(ButtonStyle.Secondary)
                );

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.updateItemPreviewMessage(channel, embed, [row], cartId, itemId);

        } catch (error) {
            console.error('[ERROR] Error sending item preview embed:', error);
            throw error;
        }
    }

    
    static async handleSearchInCategory(channel, cartId, category, searchQuery, page = 1) {
        try {
            console.log(`[DEBUG] handleSearchInCategory - category: ${category}, searchQuery: "${searchQuery}", page: ${page}`);

            
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
                console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
            } else {
                console.log(`[DEBUG] Catalog file not found`);
                return;
            }

            const query = searchQuery.toLowerCase();

            
            const allItems = catalog.filter(item => {
                let matchesCategory = false;

                if (category === 'CHROMA') {
                    matchesCategory = item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    matchesCategory = item.subInventoryType === 'CHROMA_BUNDLE';
                } else if (category === 'CHAMPION_SKIN') {
                    matchesCategory = item.inventoryType === 'CHAMPION_SKIN' &&
                        item.subInventoryType !== 'RECOLOR' &&
                        item.subInventoryType !== 'CHROMA_BUNDLE';
                } else {
                    matchesCategory = item.inventoryType === category;
                }

                const matchesSearch = item.name.toLowerCase().includes(query) ||
                    (item.champion && item.champion.toLowerCase().includes(query)) ||
                    (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));

                
                const hasValidPrice = item.price && item.price > 0;

                return matchesCategory && matchesSearch && hasValidPrice;
            });

            console.log(`[DEBUG] Found ${allItems.length} items after filtering category, search, and price`);

            
            const uniqueItems = [];
            const seenNames = new Set();

            allItems.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                }
            });

            console.log(`[DEBUG] Found ${uniqueItems.length} unique items after removing duplicates`);

            if (uniqueItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Nenhum Resultado na Categoria')
                    .setDescription(`Nenhum item encontrado para: **${searchQuery}** na categoria **${this.getCategoryName(category)}**\n\n` +
                        'Tente:\n' +
                        '• Termos mais simples\n' +
                        '• Nome do campeão\n' +
                        '• Nome da skin\n\n' +
                        '💡 *Apenas itens com preço válido são exibidos*')
                    .setColor('#ed4245')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.updateSearchMessage(channel, embed, [row], cartId, searchQuery);
                return;
            }

            
            const needsPagination = uniqueItems.length > 10;
            const itemsPerPage = 10;
            const totalPages = needsPagination ? Math.ceil(uniqueItems.length / itemsPerPage) : 1;
            const startIndex = needsPagination ? (page - 1) * itemsPerPage : 0;
            const endIndex = needsPagination ? startIndex + itemsPerPage : uniqueItems.length;
            const currentPageItems = uniqueItems.slice(startIndex, endIndex);

            console.log(`[DEBUG] Pagination: showing ${currentPageItems.length} items on page ${page}/${totalPages}`);

            
            let itemsList = '';
            currentPageItems.forEach((item, index) => {
                const globalIndex = startIndex + index + 1;
                itemsList += `**${globalIndex}.** ${item.name}\n`;
                itemsList += `💰 ${item.price.toLocaleString()} RP - ${(item.price * 0.01).toFixed(2)}€\n\n`;
            });

            if (needsPagination && page < totalPages) {
                const remainingItems = uniqueItems.length - endIndex;
                itemsList += `... e mais ${remainingItems} itens\n\n`;
                itemsList += `💡 *Use os botões de navegação para ver mais*`;
            }

            
            const embed = new EmbedBuilder()
                .setTitle('🔍 Resultados da Pesquisa na Categoria')
                .setColor('#5865f2')
                .setTimestamp();

            if (needsPagination) {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n` +
                    `**Página:** ${page}/${totalPages}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            } else {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            }

            const components = [];

            // Create item select menu for current page items (limit to 25 items by Discord)
            if (currentPageItems.length > 0) {
                const selectOptions = currentPageItems.slice(0, 25).map(item => ({
                    label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                    description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                    value: item.id.toString()
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`search_result_select_${cartId}`)
                    .setPlaceholder('Selecione uma skin...')
                    .addOptions(selectOptions);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            
            const navButtons = [];

            if (needsPagination && totalPages > 1) {
                if (page > 1) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page - 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('◀️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                if (page < totalPages) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page + 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('Próxima ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
            }

            
            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`search_category_${cartId}_${category}`)
                    .setLabel('🔍 Nova Pesquisa')
                    .setStyle(ButtonStyle.Primary)
            );

            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`add_item_${cartId}`)
                    .setLabel('🏷️ Voltar às Categorias')
                    .setStyle(ButtonStyle.Secondary)
            );

            components.push(new ActionRowBuilder().addComponents(navButtons));

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.updateSearchMessage(channel, embed, components, cartId, searchQuery);

            console.log(`[DEBUG] handleSearchInCategory completed successfully`);

        } catch (error) {
            console.error('[ERROR] Error handling search in category:', error);
            console.error('[ERROR] Stack trace:', error.stack);

            try {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Erro na Pesquisa')
                    .setDescription('Ocorreu um erro durante a pesquisa. Tente novamente.')
                    .setColor('#ed4245')
                    .setTimestamp();

                const backButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                
                const ClientMessageManager = require('../services/clientMessageManager');
                await ClientMessageManager.forceNewMessage(channel, {
                    embeds: [errorEmbed],
                    components: [backButton]
                }, `error_${cartId}`);

            } catch (sendError) {
                console.error('[ERROR] Could not send error message:', sendError);
            }

            throw error;
        }
    }

    static async handleSearchInCategory(channel, cartId, category, searchQuery, page = 1) {
        try {
            console.log(`[DEBUG] handleSearchInCategory - category: ${category}, searchQuery: "${searchQuery}", page: ${page}`);

            
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
                console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
            } else {
                console.log(`[DEBUG] Catalog file not found`);
                return;
            }

            const query = searchQuery.toLowerCase();

            
            const allItems = catalog.filter(item => {
                let matchesCategory = false;

                if (category === 'CHROMA') {
                    matchesCategory = item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    matchesCategory = item.subInventoryType === 'CHROMA_BUNDLE';
                } else if (category === 'CHAMPION_SKIN') {
                    matchesCategory = item.inventoryType === 'CHAMPION_SKIN' &&
                        item.subInventoryType !== 'RECOLOR' &&
                        item.subInventoryType !== 'CHROMA_BUNDLE';
                } else {
                    matchesCategory = item.inventoryType === category;
                }

                const matchesSearch = item.name.toLowerCase().includes(query) ||
                    (item.champion && item.champion.toLowerCase().includes(query)) ||
                    (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));

                
                const hasValidPrice = item.price && item.price > 0;

                return matchesCategory && matchesSearch && hasValidPrice;
            });

            console.log(`[DEBUG] Found ${allItems.length} items after filtering category, search, and price`);

            
            const uniqueItems = [];
            const seenNames = new Set();

            allItems.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                }
            });

            console.log(`[DEBUG] Found ${uniqueItems.length} unique items after removing duplicates`);

            if (uniqueItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Nenhum Resultado na Categoria')
                    .setDescription(`Nenhum item encontrado para: **${searchQuery}** na categoria **${this.getCategoryName(category)}**\n\n` +
                        'Tente:\n' +
                        '• Termos mais simples\n' +
                        '• Nome do campeão\n' +
                        '• Nome da skin\n\n' +
                        '💡 *Apenas itens com preço válido são exibidos*')
                    .setColor('#ed4245')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await channel.send({
                    embeds: [embed],
                    components: [row]
                });
                return;
            }

            
            const needsPagination = uniqueItems.length > 10;
            const itemsPerPage = 10;
            const totalPages = needsPagination ? Math.ceil(uniqueItems.length / itemsPerPage) : 1;
            const startIndex = needsPagination ? (page - 1) * itemsPerPage : 0;
            const endIndex = needsPagination ? startIndex + itemsPerPage : uniqueItems.length;
            const currentPageItems = uniqueItems.slice(startIndex, endIndex);

            console.log(`[DEBUG] Pagination: showing ${currentPageItems.length} items on page ${page}/${totalPages}`);

            
            let itemsList = '';
            currentPageItems.forEach((item, index) => {
                const globalIndex = startIndex + index + 1;
                itemsList += `**${globalIndex}.** ${item.name}\n`;
                itemsList += `💰 ${item.price.toLocaleString()} RP - ${(item.price * 0.01).toFixed(2)}€\n\n`;
            });

            if (needsPagination && page < totalPages) {
                const remainingItems = uniqueItems.length - endIndex;
                itemsList += `... e mais ${remainingItems} itens\n\n`;
                itemsList += `💡 *Use os botões de navegação para ver mais*`;
            }

            
            const embed = new EmbedBuilder()
                .setTitle('🔍 Resultados da Pesquisa na Categoria')
                .setColor('#5865f2')
                .setTimestamp();

            if (needsPagination) {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n` +
                    `**Página:** ${page}/${totalPages}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            } else {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            }

            const components = [];

            // Create item select menu for current page items (limit to 25 items by Discord)
            if (currentPageItems.length > 0) {
                const selectOptions = currentPageItems.slice(0, 25).map(item => ({
                    label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                    description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                    value: item.id.toString()
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`search_result_select_${cartId}`)
                    .setPlaceholder('Selecione uma skin...')
                    .addOptions(selectOptions);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            
            const navButtons = [];

            if (needsPagination && totalPages > 1) {
                if (page > 1) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page - 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('◀️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                if (page < totalPages) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page + 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('Próxima ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
            }

            
            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`search_category_${cartId}_${category}`)
                    .setLabel('🔍 Nova Pesquisa')
                    .setStyle(ButtonStyle.Primary)
            );

            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`add_item_${cartId}`)
                    .setLabel('🏷️ Voltar às Categorias')
                    .setStyle(ButtonStyle.Secondary)
            );

            components.push(new ActionRowBuilder().addComponents(navButtons));

            
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            if (lastMessage && lastMessage.author.id === channel.client.user.id && lastMessage.embeds.length > 0) {
                console.log(`[DEBUG] Editing existing message`);
                await lastMessage.edit({
                    embeds: [embed],
                    components: components
                });
            } else {
                console.log(`[DEBUG] Sending new message`);
                await channel.send({
                    embeds: [embed],
                    components: components
                });
            }

            console.log(`[DEBUG] handleSearchInCategory completed successfully`);

        } catch (error) {
            console.error('[ERROR] Error handling search in category:', error);
            console.error('[ERROR] Stack trace:', error.stack);

            try {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Erro na Pesquisa')
                    .setDescription('Ocorreu um erro durante a pesquisa. Tente novamente.')
                    .setColor('#ed4245')
                    .setTimestamp();

                const backButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await channel.send({
                    embeds: [errorEmbed],
                    components: [backButton]
                });
            } catch (sendError) {
                console.error('[ERROR] Could not send error message:', sendError);
            }

            throw error;
        }
    }

    
    static getCategoryEmoji(category) {
        const emojis = {
            'SKIN': '🎨',
            'CHAMPION': '🏆',
            'CHROMA': '🌈',
            'BUNDLE': '📦',
            'CHROMA_BUNDLE': '🎁',
            'WARD': '👁️',
            'ICON': '🖼️',
            'EMOTE': '😊',
            'Epic': '⚡',
            'Legendary': '🌟',
            'Ultimate': '👑',
            'Rare': '💎',
            'Common': '🔸',
            'OTHER': '❓'
        };
        return emojis[category] || '🎨';
    }

    static getCategoryEmojiObject(category) {
        const emoji = this.getCategoryEmoji(category);
        return { name: emoji };
    }

    static getCategoryName(category) {
        const names = {
            'CHAMPION_SKIN': 'Skins de Campeão',
            'CHAMPION': 'Campeões',
            'WARD_SKIN': 'Skins de Ward',
            'SUMMONER_ICON': 'Ícones',
            'EMOTE': 'Emotes',
            'BUNDLES': 'Pacotes',
            'COMPANION': 'Companheiros',
            'TFT_MAP_SKIN': 'Skins de Mapa TFT',
            'TFT_DAMAGE_SKIN': 'Skins de Dano TFT',
            'HEXTECH_CRAFTING': 'Itens Hextech',
            'CHROMA': 'Chromas',
            'CHROMA_BUNDLE': 'Pacotes de Chroma',
            'OTHER': 'Outros'
        };
        return names[category] || category;
    }

    
    

    static async validateItemAddition(cartId, itemId) {
        try {
            
            const cart = await Cart.findById(cartId);
            if (!cart) {
                return { valid: false, error: 'Carrinho não encontrado' };
            }

            
            let catalog = [];
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
                
                catalog = catalog.filter(item => item.price && item.price > 0);
            } else {
                return { valid: false, error: 'Catálogo não encontrado' };
            }

            
            const item = catalog.find(i => i.id == itemId);
            if (!item) {
                return { valid: false, error: 'Item não encontrado no catálogo ou sem preço válido' };
            }

            
        } catch (error) {
            console.error('Error validating item addition:', error);
            return { valid: false, error: 'Erro interno ao validar item' };
        }
    }

    
    static async sendCloseCartConfirmation(channel, cartId) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Fechar Carrinho')
                .setDescription('**Tem certeza que deseja fechar este carrinho?**\n\n' +
                    '⚠️ Todos os itens serão removidos e este canal será deletado.\n' +
                    'Esta ação não pode ser desfeita!')
                .setColor('#faa61a')
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_close_${cartId}`)
                        .setLabel('✅ Sim, Fechar')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`cancel_close_${cartId}`)
                        .setLabel('❌ Cancelar')
                        .setStyle(ButtonStyle.Secondary)
                );

            
            const ClientMessageManager = require('../services/clientMessageManager');
            await ClientMessageManager.forceNewMessage(channel, {
                embeds: [embed],
                components: [row]
            }, `close_confirm_${cartId}`);

        } catch (error) {
            console.error('Error sending close cart confirmation:', error);
            throw error;
        }
    }


    static async handleCloseCart(interaction, cartId) {
        try {
            await interaction.deferUpdate();

            
            await Cart.delete(cartId);

            
            const embed = new EmbedBuilder()
                .setTitle('🔒 Carrinho Fechado')
                .setDescription('Este carrinho foi fechado.\n' +
                    'O canal será deletado em 10 segundos.')
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
                    console.error('Error deleting channel:', error);
                }
            }, 10000);

        } catch (error) {
            console.error('Error handling close cart:', error);
            await interaction.followUp({
                content: '❌ Erro ao fechar carrinho.',
                ephemeral: true
            });
        }
    }
}

module.exports = CartService;