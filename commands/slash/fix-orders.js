const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../../database/connection');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fix-orders')
        .setDescription('Corrige pedidos que ficaram travados')
        .setDefaultMemberPermissions(0)
        .addSubcommand(subcommand =>
            subcommand
                .setName('complete')
                .setDescription('Marca um pedido específico como COMPLETED')
                .addIntegerOption(option =>
                    option.setName('order_id')
                        .setDescription('ID do pedido para completar')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-pending')
                .setDescription('Lista todos os pedidos que não estão COMPLETED')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bulk-complete')
                .setDescription('Completa todos os pedidos AWAITING_ACCOUNT_SELECTION que já tiveram RP debitado')
        ),

    async execute(interaction) {
        // Verificar permissões
        if (!interaction.member || !interaction.guild) {
            return await interaction.reply({
                content: '❌ Este comando só pode ser usado em um servidor.',
                ephemeral: true
            });
        }

        if (!interaction.member.roles.cache.has(config.adminRoleId)) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'complete':
                    await handleCompleteOrder(interaction);
                    break;
                case 'list-pending':
                    await handleListPending(interaction);
                    break;
                case 'bulk-complete':
                    await handleBulkComplete(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in fix-orders command:', error);
            await interaction.reply({
                content: `❌ Erro ao processar comando: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

async function handleCompleteOrder(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const orderId = interaction.options.getInteger('order_id');

    try {
        // Buscar o pedido
        const order = await db.get('SELECT * FROM order_logs WHERE id = ?', [orderId]);

        if (!order) {
            return await interaction.editReply({
                content: `❌ Pedido #${orderId} não encontrado.`
            });
        }

        if (order.status === 'COMPLETED') {
            return await interaction.editReply({
                content: `✅ Pedido #${orderId} já está marcado como COMPLETED.`
            });
        }

        // Atualizar status para COMPLETED
        const updateResult = await db.run(
            'UPDATE order_logs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['COMPLETED', orderId]
        );

        if (updateResult.changes > 0) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Pedido Marcado como Concluído')
                .setDescription(`Pedido #${orderId} foi marcado como **COMPLETED**`)
                .addFields([
                    { name: '🆔 Order ID', value: orderId.toString(), inline: true },
                    { name: '👤 Cliente', value: `<@${order.user_id}>`, inline: true },
                    { name: '💰 Valor', value: `${order.total_rp.toLocaleString()} RP (€${order.total_price.toFixed(2)})`, inline: true },
                    { name: '📅 Status anterior', value: order.status, inline: true },
                    { name: '📅 Novo status', value: '**COMPLETED**', inline: true },
                    { name: '👨‍💼 Corrigido por', value: `<@${interaction.user.id}>`, inline: true }
                ])
                .setColor('#57f287')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                content: `❌ Falha ao atualizar pedido #${orderId}.`
            });
        }

    } catch (error) {
        console.error('Error completing order:', error);
        await interaction.editReply({
            content: `❌ Erro ao completar pedido: ${error.message}`
        });
    }
}

async function handleListPending(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const pendingOrders = await db.all(`
            SELECT id, user_id, status, total_rp, total_price, created_at, selected_account_id
            FROM order_logs 
            WHERE status != 'COMPLETED' AND status != 'REJECTED'
            ORDER BY created_at DESC
            LIMIT 20
        `);

        if (pendingOrders.length === 0) {
            return await interaction.editReply({
                content: '✅ Não há pedidos pendentes no momento!'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Pedidos Pendentes')
            .setDescription(`Encontrados ${pendingOrders.length} pedidos não finalizados:`)
            .setColor('#faa61a')
            .setTimestamp();

        let pendingList = '';
        pendingOrders.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString('pt-BR');
            const hasAccount = order.selected_account_id ? '✅' : '❌';
            
            pendingList += `**#${order.id}** - ${order.status}\n`;
            pendingList += `👤 <@${order.user_id}> | 💰 ${order.total_rp.toLocaleString()} RP | 📅 ${date} | 🎮 ${hasAccount}\n\n`;
        });

        embed.setDescription(`Encontrados ${pendingOrders.length} pedidos não finalizados:\n\n${pendingList}`);
        
        embed.addFields([
            {
                name: '🔧 Comandos úteis',
                value: 
                    '`/fix-orders complete order_id:[ID]` - Marcar como concluído\n' +
                    '`/fix-orders bulk-complete` - Completar todos elegíveis',
                inline: false
            }
        ]);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error listing pending orders:', error);
        await interaction.editReply({
            content: `❌ Erro ao listar pedidos: ${error.message}`
        });
    }
}

async function handleBulkComplete(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        // Buscar pedidos que estão AWAITING_ACCOUNT_SELECTION mas já tem conta selecionada
        const eligibleOrders = await db.all(`
            SELECT id, user_id, status, total_rp, total_price, selected_account_id
            FROM order_logs 
            WHERE status = 'AWAITING_ACCOUNT_SELECTION' 
            AND selected_account_id IS NOT NULL
            AND selected_account_id != ''
        `);

        if (eligibleOrders.length === 0) {
            return await interaction.editReply({
                content: '✅ Não há pedidos elegíveis para completar em massa.'
            });
        }

        let completed = 0;
        let errors = 0;

        for (const order of eligibleOrders) {
            try {
                const updateResult = await db.run(
                    `UPDATE order_logs 
                     SET status = 'COMPLETED', 
                         admin_notes = 'Completado automaticamente via bulk-complete',
                         processed_by_admin_id = ?,
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [interaction.user.id, order.id]
                );

                if (updateResult.changes > 0) {
                    completed++;
                    console.log(`[BULK-COMPLETE] Order ${order.id} marked as COMPLETED`);
                } else {
                    errors++;
                }
            } catch (orderError) {
                console.error(`[BULK-COMPLETE] Error updating order ${order.id}:`, orderError);
                errors++;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('🔄 Correção em Massa Concluída')
            .setDescription(
                `**Resultado da operação:**\n\n` +
                `✅ **Completados:** ${completed} pedidos\n` +
                `❌ **Erros:** ${errors} pedidos\n` +
                `📊 **Total processado:** ${eligibleOrders.length} pedidos`
            )
            .addFields([
                {
                    name: '📋 Pedidos corrigidos',
                    value: completed > 0 ? 
                        eligibleOrders.slice(0, completed).map(o => `#${o.id}`).join(', ') :
                        'Nenhum pedido foi corrigido',
                    inline: false
                },
                {
                    name: '👨‍💼 Executado por',
                    value: `<@${interaction.user.id}>`,
                    inline: true
                },
                {
                    name: '⏰ Data/Hora',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                }
            ])
            .setColor(completed > 0 ? '#57f287' : '#ed4245')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in bulk complete:', error);
        await interaction.editReply({
            content: `❌ Erro na correção em massa: ${error.message}`
        });
    }
}