const { MessageManager, Channel, Message, EmbedBuilder } = require('discord.js');

class ClientMessageManager {
    constructor() {
        
        this.lastBotMessages = new Map(); 
        this.messageTimestamps = new Map(); 
        this.channelContexts = new Map(); 
        
        
        this.maxMessageAge = 60 * 60 * 1000; 
        this.cleanupInterval = 30 * 60 * 1000; 
        
        
        this.startPeriodicCleanup();
        
        console.log('[ClientMessageManager] Initialized');
    }

    
    async sendOrEditClientMessage(channel, messageData, context = null, forceNew = false) {
        try {
            const channelId = channel.id;
            
            console.log(`[ClientMessageManager] Processing message for channel ${channelId}, context: ${context}, forceNew: ${forceNew}`);
            
            
            if (forceNew) {
                return await this.createNewMessage(channel, messageData, context);
            }

            
            const editResult = await this.tryEditExistingMessage(channel, messageData, context);
            if (editResult) {
                return editResult;
            }

            
            return await this.createNewMessage(channel, messageData, context);

        } catch (error) {
            console.error('[ClientMessageManager] Error in sendOrEditClientMessage:', error);
            throw error;
        }
    }

    
    async tryEditExistingMessage(channel, messageData, context) {
        try {
            const channelId = channel.id;
            const lastMessageId = this.lastBotMessages.get(channelId);

            if (!lastMessageId) {
                console.log(`[ClientMessageManager] No previous message found for channel ${channelId}`);
                return null;
            }

            
            let lastMessage;
            try {
                lastMessage = await channel.messages.fetch(lastMessageId);
            } catch (fetchError) {
                console.log(`[ClientMessageManager] Could not fetch message ${lastMessageId}: ${fetchError.message}`);
                this.removeFromCache(channelId);
                return null;
            }

            
            if (!this.isValidForEdit(lastMessage)) {
                console.log(`[ClientMessageManager] Message ${lastMessageId} is not valid for editing`);
                this.removeFromCache(channelId);
                return null;
            }

            
            await lastMessage.edit(messageData);
            this.updateTimestamp(lastMessageId);
            
            
            if (context) {
                this.channelContexts.set(channelId, context);
            }

            console.log(`[ClientMessageManager] Successfully edited message ${lastMessageId} in channel ${channelId}`);
            return lastMessage;

        } catch (error) {
            console.error('[ClientMessageManager] Error trying to edit message:', error);
            return null;
        }
    }

    
    async createNewMessage(channel, messageData, context) {
        try {
            const channelId = channel.id;

            
            await this.cleanupOldMessages(channel);

            
            const newMessage = await channel.send(messageData);
            
            
            this.lastBotMessages.set(channelId, newMessage.id);
            this.updateTimestamp(newMessage.id);
            
            if (context) {
                this.channelContexts.set(channelId, context);
            }

            console.log(`[ClientMessageManager] Created new message ${newMessage.id} in channel ${channelId}`);
            return newMessage;

        } catch (error) {
            console.error('[ClientMessageManager] Error creating new message:', error);
            throw error;
        }
    }

    
    isValidForEdit(message) {
        if (!message || message.author.id !== message.client.user.id) {
            return false;
        }

        
        if (!message.embeds || message.embeds.length === 0) {
            return false;
        }

        
        const messageAge = Date.now() - message.createdTimestamp;
        if (messageAge > this.maxMessageAge) {
            return false;
        }

        return true;
    }

    
    updateTimestamp(messageId) {
        this.messageTimestamps.set(messageId, Date.now());
    }

    
    removeFromCache(channelId) {
        const messageId = this.lastBotMessages.get(channelId);
        if (messageId) {
            this.messageTimestamps.delete(messageId);
        }
        this.lastBotMessages.delete(channelId);
        this.channelContexts.delete(channelId);
        
        console.log(`[ClientMessageManager] Removed cache for channel ${channelId}`);
    }

    
    async cleanupOldMessages(channel = null, deleteFromChannel = true) {
        try {
            if (!channel || !deleteFromChannel) return;

            const messages = await channel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(msg => 
                msg.author.id === channel.client.user.id && 
                msg.embeds.length > 0
            );

            
            if (botMessages.size > 1) {
                const sortedMessages = Array.from(botMessages.values())
                    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

                
                for (let i = 1; i < sortedMessages.length; i++) {
                    try {
                        await sortedMessages[i].delete();
                        console.log(`[ClientMessageManager] Deleted old message ${sortedMessages[i].id} from channel ${channel.id}`);
                    } catch (deleteError) {
                        console.warn(`[ClientMessageManager] Could not delete message: ${deleteError.message}`);
                    }
                }
            }
        } catch (error) {
            console.error('[ClientMessageManager] Error in cleanupOldMessages:', error);
        }
    }

    
    cleanupCache() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [messageId, timestamp] of this.messageTimestamps.entries()) {
            if (now - timestamp > this.maxMessageAge) {
                this.messageTimestamps.delete(messageId);
                cleanedCount++;
                
                
                for (const [channelId, cachedMessageId] of this.lastBotMessages.entries()) {
                    if (cachedMessageId === messageId) {
                        this.lastBotMessages.delete(channelId);
                        this.channelContexts.delete(channelId);
                        break;
                    }
                }
            }
        }

        if (cleanedCount > 0) {
            console.log(`[ClientMessageManager] Cleaned ${cleanedCount} old entries from cache`);
        }
    }

    
    startPeriodicCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, this.cleanupInterval);
        
        console.log(`[ClientMessageManager] Started periodic cleanup every ${this.cleanupInterval / 1000}s`);
    }

    /**
     * Force a new message (for special cases like checkout)
     * @param {Channel} channel - Channel
     * @param {Object} messageData - Message data
     * @param {string} context - Context
     */
    async forceNewMessage(channel, messageData, context = null) {
        return await this.sendOrEditClientMessage(channel, messageData, context, true);
    }

    
    async updateCartMessage(channel, cartEmbed, components, cartId) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [cartEmbed],
            components: components
        }, `cart_${cartId}`);
    }

    
    async updateCheckoutMessage(channel, checkoutEmbed, components, cartId) {
        return await this.forceNewMessage(channel, {
            embeds: [checkoutEmbed],
            components: components
        }, `checkout_${cartId}`);
    }

    
    async updateCategoryMessage(channel, categoryEmbed, components, cartId) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [categoryEmbed],
            components: components
        }, `category_${cartId}`);
    }

    
    async updateItemsMessage(channel, itemsEmbed, components, cartId, category) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [itemsEmbed],
            components: components
        }, `items_${cartId}_${category}`);
    }

    
    async updateItemPreviewMessage(channel, previewEmbed, components, cartId, itemId) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [previewEmbed],
            components: components
        }, `preview_${cartId}_${itemId}`);
    }

    
    async updateSearchMessage(channel, searchEmbed, components, cartId, searchQuery) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [searchEmbed],
            components: components
        }, `search_${cartId}_${searchQuery}`);
    }

    
    async updateOrderConfirmationMessage(channel, orderEmbed, components, orderId) {
        return await this.sendOrEditClientMessage(channel, {
            embeds: [orderEmbed],
            components: components
        }, `order_${orderId}`);
    }
}


const clientMessageManager = new ClientMessageManager();


module.exports = clientMessageManager;


module.exports.ClientMessageManager = ClientMessageManager;