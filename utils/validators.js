

class Validators {
    static validateRiotTag(input) {
        
        const regex = /^.+#.+$/;
        return regex.test(input);
    }

    static validateRiotUsername(username) {
        
        const regex = /^[a-zA-Z0-9 ._\-]+$/;
        return regex.test(username) && username.length >= 3 && username.length <= 16;
    }

    static validateRiotTagLine(tagLine) {
        
        
        return tagLine && tagLine.length > 0 && tagLine.length <= 5;
    }

    static validateDiscordId(id) {
        
        const regex = /^\d{17,19}$/;
        return regex.test(id);
    }

    static validateRP(amount) {
        
        return Number.isInteger(amount) && amount > 0 && amount <= 999999;
    }

    static validateFriendsCount(count) {
        
        return Number.isInteger(count) && count >= 0 && count <= 250;
    }

    static validateAccountNickname(nickname) {
        
        return typeof nickname === 'string' && 
               nickname.length >= 3 && 
               nickname.length <= 50 &&
               !/[<>@#&]/.test(nickname); 
    }

    static validateSkinName(name) {
        
        return typeof name === 'string' && 
               name.length >= 3 && 
               name.length <= 100;
    }

    static validateSearchQuery(query) {
        
        return typeof query === 'string' && 
               query.trim().length >= 2 && 
               query.length <= 100;
    }

    static validatePrice(price) {
        
        return typeof price === 'number' && 
               price >= 0 && 
               price <= 10000 && 
               Number.isFinite(price);
    }

    static validateChannelId(id) {
        
        return this.validateDiscordId(id);
    }

    static validateRoleId(id) {
        
        return this.validateDiscordId(id);
    }

    static sanitizeString(str) {
        
        if (typeof str !== 'string') return '';
        return str.replace(/[<>@#&]/g, '').trim();
    }

    static parseRiotTag(fullTag) {
        
        if (!this.validateRiotTag(fullTag)) {
            return null;
        }

        const [username, tagLine] = fullTag.split('#');
        return {
            username: username.trim(),
            tagLine: tagLine.trim()
        };
    }

    static formatRiotTag(username, tagLine) {
        
        return `${username}#${tagLine}`;
    }

    static validateEmail(email) {
        
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    static validateUrl(url) {
        
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static validateCryptoAddress(address, type) {
        
        const patterns = {
            BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
            ETH: /^0x[a-fA-F0-9]{40}$/,
            LTC: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/
        };

        if (type && patterns[type]) {
            return patterns[type].test(address);
        }

        
        return Object.values(patterns).some(pattern => pattern.test(address));
    }
}

module.exports = Validators;