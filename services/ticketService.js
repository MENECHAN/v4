const { ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

class TicketService {
    static async createTicket(guild, user, region = null) {
        try {
            
            const regionPrefix = region ? `${region.toLowerCase()}-` : '';
            const ticketName = `carrinho-${regionPrefix}${user.username.toLowerCase()}-${Date.now()}`;

            
            const ticketChannel = await guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: config.adminRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: config.gifterRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: guild.client.user.id, 
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.AddReactions
                        ]
                    }
                ]
            });

            
            await this.sendWelcomeMessage(ticketChannel, user, region);

            return ticketChannel;
        } catch (error) {
            console.error('Error creating ticket:', error);
            throw error;
        }
    }

    static async sendWelcomeMessage(channel, user, region = null) {
        try {
            const regionText = region ? ` (Região: ${region})` : '';

            const embed = new EmbedBuilder()
                .setTitle(`🎮 Bem-vindo ao seu carrinho${regionText}, ${user.displayName}!`)
                .setDescription(`Este é seu canal privado para compras. Aqui você pode:\n\n` +
                    `• Adicionar skins ao carrinho\n` +
                    `• Remover itens\n` +
                    `• Finalizar sua compra\n` +
                    `• Receber suporte\n\n` +
                    `${region ? `🌎 **Região selecionada: ${region}**\n\n` : ''}` +
                    `Use os botões abaixo para gerenciar seu carrinho.`)
                .setColor('#5865f2')
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await channel.send({
                content: `${user}`,
                embeds: [embed]
            });
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }

    static async closeTicket(channel, reason = 'Ticket fechado automaticamente') {
        try {
            
            const embed = new EmbedBuilder()
                .setTitle('🔒 Fechando Ticket')
                .setDescription(`Este ticket será fechado em 10 segundos.\n**Motivo:** ${reason}`)
                .setColor('#ed4245')
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 10000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            throw error;
        }
    }

    static async archiveTicket(channel, orderId) {
        try {
            
            let archiveCategory = channel.guild.channels.cache.find(
                c => c.name === 'Tickets Arquivados' && c.type === ChannelType.GuildCategory
            );

            if (!archiveCategory) {
                archiveCategory = await channel.guild.channels.create({
                    name: 'Tickets Arquivados',
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: channel.guild.roles.everyone,
                            deny: [PermissionsBitField.Flags.ViewChannel]
                        },
                        {
                            id: config.adminRoleId,
                            allow: [PermissionsBitField.Flags.ViewChannel]
                        }
                    ]
                });
            }

            
            await channel.setParent(archiveCategory);
            await channel.setName(`archived-${orderId}-${Date.now()}`);

            
            await channel.permissionOverwrites.create(channel.guild.roles.everyone, {
                ViewChannel: false
            });

        } catch (error) {
            console.error('Error archiving ticket:', error);
            throw error;
        }
    }

    static async sendOrderCompletedMessage(channel, cart, items) {
        try {
            const completedEmbed = new EmbedBuilder()
                .setTitle('✅ Pedido Concluído')
                .setDescription('**Seu pedido foi processado com sucesso!**\n\n' +
                    'Todas as skins foram enviadas para suas contas.\n' +
                    'Obrigado por escolher nosso serviço!')
                .setColor('#57f287')
                .setTimestamp();

            let itemsList = '';
            items.forEach((item, index) => {
                itemsList += `${index + 1}. ${item.skin_name}\n`;
            });

            completedEmbed.addFields([
                { name: '🎨 Skins Entregues', value: itemsList, inline: false },
                { name: '💰 Total Pago', value: `${cart.total_price.toFixed(2)}€`, inline: true }
            ]);

            await channel.send({ embeds: [completedEmbed] });

            
            setTimeout(async () => {
                try {
                    await this.archiveTicket(channel, cart.id);
                } catch (error) {
                    console.error('Error auto-archiving ticket:', error);
                }
            }, 300000); 

        } catch (error) {
            console.error('Error sending order completed message:', error);
            throw error;
        }
    }
}

module.exports = TicketService;