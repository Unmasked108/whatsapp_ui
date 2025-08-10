class WhatsAppClone {
    constructor() {
        this.socket = null;
        this.currentConversation = null;
        this.conversations = [];
        this.messages = [];
        // this.apiBaseUrl = 'http://localhost:3000';
                this.apiBaseUrl = 'https://whatsapp-api-n6it.onrender.com';

        this.typingTimeout = null;
        this.lastActivity = Date.now();
        
        this.initializeElements();
        this.initializeSocketConnection();
        this.attachEventListeners();
        this.loadConversations();
        this.startActivityMonitor();
    }

    initializeElements() {
        this.conversationsList = document.getElementById('conversationsList');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.chatContainer = document.getElementById('chatContainer');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.contactName = document.getElementById('contactName');
        this.contactStatus = document.getElementById('contactStatus');
        this.searchInput = document.getElementById('searchInput');
        this.connectionStatus = document.getElementById('connectionStatus');
    }

    initializeSocketConnection() {
        // Check if Socket.IO is available
        if (typeof io === 'undefined') {
            console.warn('Socket.IO not available. Real-time features disabled.');
            this.updateConnectionStatus('disconnected');
            return;
        }

        try {
            this.socket = io(this.apiBaseUrl);
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateConnectionStatus('connected');
                this.showSuccessToast('Connected to WhatsApp Web');
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.updateConnectionStatus('disconnected');
                this.showErrorToast('Connection lost. Trying to reconnect...');
            });

            this.socket.on('connecting', () => {
                this.updateConnectionStatus('connecting');
            });

            this.socket.on('new_message', (message) => {
                console.log('New message received:', message);
                this.handleNewMessage(message);
            });

            this.socket.on('message_status_update', (statusUpdate) => {
                console.log('Status update received:', statusUpdate);
                this.handleStatusUpdate(statusUpdate);
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                this.updateConnectionStatus('disconnected');
            });

            // Auto reconnection
            this.socket.on('reconnect', (attemptNumber) => {
                console.log('Reconnected after', attemptNumber, 'attempts');
                this.updateConnectionStatus('connected');
                this.showSuccessToast('Reconnected successfully');
                this.loadConversations(); // Refresh data
            });

        } catch (error) {
            console.error('Error initializing socket connection:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    updateConnectionStatus(status) {
        const statusElement = this.connectionStatus;
        if (!statusElement) return;

        const statusText = statusElement.querySelector('span');
        const statusIcon = statusElement.querySelector('i');

        if (!statusText || !statusIcon) return;

        statusElement.className = `connection-status ${status}`;
        
        switch(status) {
            case 'connected':
                statusText.textContent = 'WhatsApp Web';
                statusIcon.className = 'fas fa-wifi';
                break;
            case 'disconnected':
                statusText.textContent = 'Connecting...';
                statusIcon.className = 'fas fa-wifi-slash';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                statusIcon.className = 'fas fa-spinner fa-spin';
                break;
        }
    }

    attachEventListeners() {
        if (!this.sendBtn || !this.messageInput || !this.searchInput) {
            console.error('Required elements not found');
            return;
        }

        // Send message on button click
        this.sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        // Send message on Enter key
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Search functionality with debouncing
        let searchTimeout;
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filterConversations(e.target.value);
            }, 300);
        });

        // Enable/disable send button based on input
        this.messageInput.addEventListener('input', (e) => {
            const hasText = e.target.value.trim().length > 0;
            this.sendBtn.disabled = !hasText;
            
            // Update last activity
            this.lastActivity = Date.now();
            
            // Show typing indicator (in real app, this would be sent to other users)
            if (hasText && this.currentConversation) {
                this.clearTypingTimeout();
                this.typingTimeout = setTimeout(() => {
                    console.log('User stopped typing');
                }, 1000);
            }
        });

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput.focus();
            }
            
            // Escape to clear search
            if (e.key === 'Escape' && document.activeElement === this.searchInput) {
                this.searchInput.value = '';
                this.filterConversations('');
            }
        });
    }

    clearTypingTimeout() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    startActivityMonitor() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceActivity = now - this.lastActivity;
            
            // Update contact status based on activity
            if (this.contactStatus && this.currentConversation) {
                if (timeSinceActivity < 30000) { // Less than 30 seconds
                    this.contactStatus.textContent = 'online';
                    this.contactStatus.style.color = '#00a884';
                } else {
                    const conversation = this.conversations.find(c => c._id === this.currentConversation);
                    if (conversation) {
                        const lastSeen = this.formatLastSeen(conversation.last_timestamp);
                        this.contactStatus.textContent = lastSeen;
                        this.contactStatus.style.color = '#aebac1';
                    }
                }
            }
        }, 5000);
    }

    async loadConversations() {
        try {
            console.log('Loading conversations...');
            
            // Show loading state
            if (this.conversationsList) {
                this.conversationsList.innerHTML = `
                    <div class="loading-conversations">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading conversations...</span>
                    </div>
                `;
            }

            const response = await fetch(`${this.apiBaseUrl}/api/conversations`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(15000) // Increased timeout
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Conversations data received:', data);
            
            this.conversations = data;
            this.renderConversations();

            // Show success message if this is initial load
            if (data.length > 0) {
                console.log(`✅ Loaded ${data.length} conversations successfully`);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            
            // Show detailed error information
            let errorMessage = 'Failed to load conversations';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Cannot connect to server. Make sure the backend is running on port 3000.';
            } else if (error.name === 'TimeoutError') {
                errorMessage = 'Request timeout. Server might be slow or unavailable.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showErrorToast(errorMessage);
            
            // Show error state in conversations list
            if (this.conversationsList) {
                this.conversationsList.innerHTML = `
                    <div class="loading-conversations error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Failed to load conversations</span>
                        <button onclick="whatsApp.loadConversations()" class="retry-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderConversations() {
        if (!this.conversationsList) return;

        if (this.conversations.length === 0) {
            this.conversationsList.innerHTML = `
                <div class="loading-conversations">
                    <i class="fab fa-whatsapp"></i>
                    <span>No conversations yet</span>
                    <small>Sample messages will appear here</small>
                </div>
            `;
            return;
        }

        this.conversationsList.innerHTML = this.conversations.map(conversation => {
            const time = this.formatTimestamp(conversation.last_timestamp);
            const isActive = this.currentConversation === conversation._id;
            
            return `
                <div class="conversation-item ${isActive ? 'active' : ''}" 
                     data-wa-id="${conversation._id}" 
                     onclick="whatsApp.selectConversation('${conversation._id}')">
                    <div class="conversation-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-header">
                            <span class="conversation-name">${this.escapeHtml(conversation.profile_name || 'Unknown Contact')}</span>
                            <span class="conversation-time">${time}</span>
                        </div>
                        <div class="conversation-preview">
                            <span class="message-preview">${this.escapeHtml(this.truncateMessage(conversation.last_message || 'No messages'))}</span>
                            ${conversation.unread_count > 0 ? `<span class="unread-badge">${conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        console.log(`📋 Rendered ${this.conversations.length} conversations`);
    }

    truncateMessage(message, maxLength = 30) {
        if (!message) return '';
        return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
    }

    filterConversations(searchTerm) {
        if (!this.conversations || this.conversations.length === 0) return;

        const filteredConversations = this.conversations.filter(conv => {
            const profileName = (conv.profile_name || '').toLowerCase();
            const waId = (conv._id || '').toLowerCase();
            const lastMessage = (conv.last_message || '').toLowerCase();
            const search = searchTerm.toLowerCase();
            
            return profileName.includes(search) || 
                   waId.includes(search) || 
                   lastMessage.includes(search);
        });
        
        if (!this.conversationsList) return;

        if (filteredConversations.length === 0 && searchTerm) {
            this.conversationsList.innerHTML = `
                <div class="loading-conversations">
                    <i class="fas fa-search"></i>
                    <span>No conversations found</span>
                    <small>Try a different search term</small>
                </div>
            `;
            return;
        }

        this.conversationsList.innerHTML = filteredConversations.map(conversation => {
            const time = this.formatTimestamp(conversation.last_timestamp);
            const isActive = this.currentConversation === conversation._id;
            
            return `
                <div class="conversation-item ${isActive ? 'active' : ''}" 
                     data-wa-id="${conversation._id}" 
                     onclick="whatsApp.selectConversation('${conversation._id}')">
                    <div class="conversation-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-header">
                            <span class="conversation-name">${this.escapeHtml(conversation.profile_name || 'Unknown Contact')}</span>
                            <span class="conversation-time">${time}</span>
                        </div>
                        <div class="conversation-preview">
                            <span class="message-preview">${this.escapeHtml(this.truncateMessage(conversation.last_message || 'No messages'))}</span>
                            ${conversation.unread_count > 0 ? `<span class="unread-badge">${conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async selectConversation(waId) {
        console.log('📱 Selecting conversation:', waId);
        
        // Don't reload if same conversation
        if (this.currentConversation === waId) {
            return;
        }
        
        this.currentConversation = waId;
        
        // Update UI immediately for better UX
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const selectedItem = document.querySelector(`[data-wa-id="${waId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }

        // Find conversation details
        const conversation = this.conversations.find(conv => conv._id === waId);
        if (conversation) {
            if (this.contactName) this.contactName.textContent = conversation.profile_name || 'Unknown Contact';
            if (this.contactStatus) {
                this.contactStatus.textContent = this.formatLastSeen(conversation.last_timestamp);
                this.contactStatus.style.color = '#aebac1';
            }
        }

        // Show chat container and load messages
        if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';
        if (this.chatContainer) this.chatContainer.style.display = 'flex';
        
        // Focus message input
        setTimeout(() => {
            if (this.messageInput) {
                this.messageInput.focus();
            }
        }, 100);
        
        await this.loadMessages(waId);
    }

    formatLastSeen(timestamp) {
        if (!timestamp) return 'last seen recently';
        
        try {
            const date = new Date(parseInt(timestamp) * 1000);
            const now = new Date();
            const diffInMinutes = Math.floor((now - date) / (1000 * 60));
            
            if (diffInMinutes < 1) return 'online';
            if (diffInMinutes < 60) return `last seen ${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
            
            const diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) return `last seen ${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
            
            const diffInDays = Math.floor(diffInHours / 24);
            if (diffInDays < 7) return `last seen ${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
            
            return `last seen ${date.toLocaleDateString()}`;
        } catch (error) {
            return 'last seen recently';
        }
    }

    async loadMessages(waId) {
        try {
            console.log('💬 Loading messages for:', waId);
            
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `
                    <div class="loading-messages">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading messages...</span>
                    </div>
                `;
            }

            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${waId}/messages`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(15000)
            });
            
            console.log('Messages response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Messages response error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log(`📨 Messages loaded: ${data.length} messages`);
            
            this.messages = data;
            this.renderMessages();
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showErrorToast('Failed to load messages: ' + error.message);
            
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = `
                    <div class="loading-messages error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Error loading messages</span>
                        <button onclick="whatsApp.loadMessages('${waId}')" class="retry-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderMessages() {
        if (!this.messagesContainer) return;

        if (this.messages.length === 0) {
            this.messagesContainer.innerHTML = `
                <div class="loading-messages">
                    <i class="fas fa-comment"></i>
                    <span>No messages in this conversation</span>
                    <small>Start the conversation by sending a message</small>
                </div>
            `;
            return;
        }

        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(this.messages);
        
        let html = '';
        for (const [date, messages] of Object.entries(groupedMessages)) {
            html += `<div class="date-divider"><span>${date}</span></div>`;
            
            messages.forEach(message => {
                const time = this.formatTimestamp(message.timestamp);
                const messageType = message.is_outgoing ? 'outgoing' : 'incoming';
                
                html += `
                    <div class="message ${messageType}" data-message-id="${message.id}">
                        <div class="message-bubble">
                            <div class="message-content">${this.escapeHtml(message.message_body)}</div>
                            <div class="message-meta">
                                <span class="message-time">${time}</span>
                                ${message.is_outgoing ? `<span class="message-status ${message.status}" title="${this.getStatusText(message.status)}">${this.getStatusIcon(message.status)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        this.messagesContainer.innerHTML = html;

        // Scroll to bottom with animation
        this.scrollToBottom(true);
        
        console.log(`📝 Rendered ${this.messages.length} messages`);
    }

    groupMessagesByDate(messages) {
        const groups = {};
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        messages.forEach(message => {
            const messageDate = new Date(parseInt(message.timestamp) * 1000);
            let dateKey;
            
            if (this.isSameDay(messageDate, today)) {
                dateKey = 'Today';
            } else if (this.isSameDay(messageDate, yesterday)) {
                dateKey = 'Yesterday';
            } else {
                dateKey = messageDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
            
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(message);
        });
        
        return groups;
    }

    isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }

    getStatusIcon(status) {
        switch(status) {
            case 'sent': return '✓';
            case 'delivered': return '✓✓';
            case 'read': return '✓✓';
            default: return '';
        }
    }

    getStatusText(status) {
        switch(status) {
            case 'sent': return 'Sent';
            case 'delivered': return 'Delivered';
            case 'read': return 'Read';
            default: return '';
        }
    }

    async sendMessage() {
        const messageText = this.messageInput?.value?.trim();
        if (!messageText || !this.currentConversation) {
            console.warn('Cannot send message: missing text or conversation');
            return;
        }

        console.log('📤 Sending message:', messageText, 'to:', this.currentConversation);

        // Disable send button to prevent double sending
        if (this.sendBtn) {
            this.sendBtn.disabled = true;
            this.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/conversations/${this.currentConversation}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message_body: messageText,
                    profile_name: this.contactName?.textContent || 'You'
                }),
                signal: AbortSignal.timeout(15000)
            });

            console.log('Send message response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Send message error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const newMessage = await response.json();
            console.log('✅ Message sent successfully:', newMessage);
            
            // Add message to current messages
            this.messages.push(newMessage);
            
            // Clear input
            if (this.messageInput) {
                this.messageInput.value = '';
            }
            
            // Re-render messages
            this.renderMessages();
            
            // Update conversation list (don't await to keep UI responsive)
            this.loadConversations();
            
            // Show success feedback
            this.showSuccessToast('Message sent');
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showErrorToast('Failed to send message: ' + error.message);
        } finally {
            // Re-enable send button
            if (this.sendBtn) {
                this.sendBtn.disabled = true; // Will be enabled by input listener
                this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        }
    }

    handleNewMessage(message) {
        console.log('🔔 Handling new message:', message);
        
        // Update conversations list
        this.loadConversations();
        
        // If this message belongs to current conversation, add it to messages
        if (this.currentConversation === message.wa_id) {
            this.messages.push(message);
            this.renderMessages();
            
            // Play notification sound (optional)
            this.playNotificationSound();
        } else {
            // Show notification if not current conversation
            this.showNotification(message);
        }
    }

    handleStatusUpdate(statusUpdate) {
        console.log('📊 Handling status update:', statusUpdate);
        
        // Update message status in current conversation
        if (this.currentConversation) {
            const messageIndex = this.messages.findIndex(msg => 
                msg.id === statusUpdate.id || msg.meta_msg_id === statusUpdate.meta_msg_id
            );
            
            if (messageIndex !== -1) {
                this.messages[messageIndex].status = statusUpdate.status;
                this.updateMessageStatus(statusUpdate.id, statusUpdate.status);
            }
        }
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            if (statusElement) {
                statusElement.className = `message-status ${status}`;
                statusElement.textContent = this.getStatusIcon(status);
                statusElement.title = this.getStatusText(status);
            }
        }
    }

    showNotification(message) {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`${message.profile_name || 'Unknown'} • WhatsApp Web`, {
                body: message.message_body,
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40NzcgMiAyIDYuNDc3IDIgMTJDMiAxNC4zOSAyLjc4IDE2LjY4IDQuMTcgMTguNTdMMi41OCAyMS40MkwyIDIyTDIuNTggMjEuNDJMNC4xNyAxOC41N0MyLjc4IDE2LjY4IDIgMTQuMzkgMiAxMkMyIDYuNDc3IDYuNDc3IDIgMTIgMlpNMTIgMjJDMTcuNTIzIDIyIDIyIDE3LjUyMyAyMiAxMkMyMiA2LjQ3NyAxNy41MjMgMiAxMiAyWiIgZmlsbD0iIzI1RDM2NiIvPgo8L3N2Zz4K',
                badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40NzcgMiAyIDYuNDc3IDIgMTJDMiAxNC4zOSAyLjc4IDE2LjY4IDQuMTcgMTguNTdMMi41OCAyMS40MkwyIDIyTDIuNTggMjEuNDJMNC4xNyAxOC41N0MyLjc4IDE2LjY4IDIgMTQuMzkgMiAxMkMyIDYuNDc3IDYuNDc3IDIgMTIgMlpNMTIgMjJDMTcuNTIzIDIyIDIyIDE3LjUyMyAyMiAxMkMyMiA2LjQ3NyAxNy41MjMgMiAxMiAyWiIgZmlsbD0iIzI1RDM2NiIvPgo8L3N2Zz4K'
            });
            
            // Auto close after 5 seconds
            setTimeout(() => notification.close(), 5000);
        }
    }

    playNotificationSound() {
        // Create a subtle notification sound
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUdCEOt2+/Ij0MSyDJy1V7wz2UdXu7pxjBPH0mOu+OKPfgAAAAA');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore errors
        } catch (error) {
            // Ignore audio errors
        }
    }

    showErrorToast(message) {
        this.showToast(message, 'error');
    }

    showSuccessToast(message) {
        this.showToast(message, 'success');
    }

    showToast(message, type = 'info') {
        // Remove existing toasts of same type
        document.querySelectorAll(`.toast.${type}`).forEach(toast => toast.remove());
        
        // Create new toast
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : 
                    type === 'success' ? 'fas fa-check-circle' : 
                    'fas fa-info-circle';
        
        toast.innerHTML = `
            <i class="${icon}"></i>
            <span>${this.escapeHtml(message)}</span>
            <button onclick="this.parentElement.remove()" class="toast-close">&times;</button>
        `;
        
        // Style the toast
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#3b82f6'};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 1001;
            animation: slideInRight 0.3s ease;
            max-width: 350px;
            word-wrap: break-word;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-size: 14px;
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after delay
        const delay = type === 'error' ? 8000 : type === 'success' ? 3000 : 5000;
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }
        }, delay);
    }

    scrollToBottom(smooth = false) {
        if (this.messagesContainer) {
            const scrollOptions = {
                top: this.messagesContainer.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            };
            this.messagesContainer.scrollTo(scrollOptions);
        }
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        try {
            const date = new Date(parseInt(timestamp) * 1000);
            if (isNaN(date.getTime())) return '';
            
            const now = new Date();
            const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            
            if (diffInDays === 0) {
                // Today - show time
                return date.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                });
            } else if (diffInDays === 1) {
                // Yesterday - show time
                return 'Yesterday ' + date.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                });
            } else if (diffInDays < 7) {
                // This week - show day and time
                return date.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' +
                       date.toLocaleTimeString('en-US', { 
                           hour: 'numeric', 
                           minute: '2-digit', 
                           hour12: true 
                       });
            } else {
                // Older - show date
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: diffInDays > 365 ? 'numeric' : undefined
                });
            }
        } catch (error) {
            console.error('Error formatting timestamp:', error);
            return '';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Enhanced API connectivity test
    async testConnection() {
        try {
            console.log('🔍 Testing connection to:', this.apiBaseUrl);
            const response = await fetch(`${this.apiBaseUrl}/api/conversations`, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000)
            });
            console.log('✅ Connection test result:', response.status, response.ok ? 'OK' : 'Failed');
            return response.ok;
        } catch (error) {
            console.error('❌ Connection test failed:', error.message);
            return false;
        }
    }

    // Method to simulate receiving a message (for testing)
    simulateIncomingMessage() {
        if (!this.currentConversation) {
            console.warn('No conversation selected for simulation');
            return;
        }

        const sampleMessages = [
            "Hi there! How can I help you today?",
            "Thank you for your message. I'll get back to you shortly.",
            "That sounds great! When would be a good time to discuss this?",
            "I appreciate your interest. Let me provide you with more details.",
            "Perfect! I'll send you the information right away."
        ];

        const randomMessage = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
        
        const simulatedMessage = {
            id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            meta_msg_id: `sim_meta_${Date.now()}`,
            from: this.currentConversation,
            to: '918329446654',
            wa_id: this.currentConversation,
            profile_name: this.contactName?.textContent || 'Contact',
            message_body: randomMessage,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            status: 'received',
            is_outgoing: false,
            created_at: new Date(),
            updated_at: new Date()
        };

        this.handleNewMessage(simulatedMessage);
        console.log('📱 Simulated incoming message:', randomMessage);
    }

    // Method to export conversation (for debugging/analysis)
    exportConversation(waId = null) {
        const targetWaId = waId || this.currentConversation;
        if (!targetWaId) {
            console.warn('No conversation specified for export');
            return;
        }

        const conversation = this.conversations.find(c => c._id === targetWaId);
        const messages = this.messages.filter(m => m.wa_id === targetWaId);

        const exportData = {
            conversation_info: conversation,
            messages: messages,
            export_date: new Date().toISOString(),
            total_messages: messages.length
        };

        // Create downloadable file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsapp_conversation_${targetWaId}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('💾 Exported conversation:', targetWaId);
    }

    // Method to get app statistics
    getAppStats() {
        const stats = {
            total_conversations: this.conversations.length,
            total_messages: this.messages.length,
            current_conversation: this.currentConversation,
            connection_status: this.socket?.connected ? 'connected' : 'disconnected',
            last_activity: new Date(this.lastActivity).toISOString()
        };

        console.log('📊 App Statistics:', stats);
        return stats;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing WhatsApp Clone...');
    
    // Test if required elements exist
    const requiredElements = [
        'conversationsList',
        'welcomeScreen', 
        'chatContainer',
        'messagesContainer',
        'messageInput',
        'sendBtn'
    ];
    
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('❌ Missing required elements:', missingElements);
    } else {
        console.log('✅ All required elements found');
    }
    
    // Initialize the app
    window.whatsApp = new WhatsAppClone();
    
    // Test connection
    window.whatsApp.testConnection().then(connected => {
        if (connected) {
            console.log('✅ Initial connection test successful');
        } else {
            console.warn('⚠️ Initial connection test failed - server might not be running');
        }
    });
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('🔔 Notification permission:', permission);
        });
    }

    // Add keyboard shortcuts info to console
    console.log(`
    ⌨️  Keyboard Shortcuts:
    • Ctrl/Cmd + K: Focus search
    • Escape: Clear search (when focused)
    • Enter: Send message (in input)
    
    🛠️  Debug Methods:
    • whatsApp.simulateIncomingMessage(): Simulate receiving a message
    • whatsApp.exportConversation(): Export current conversation
    • whatsApp.getAppStats(): Get app statistics
    • whatsApp.testConnection(): Test API connection
    `);
});

// Add enhanced CSS animations and styling
const enhancedStyle = document.createElement('style');
enhancedStyle.textContent = `
    /* Toast animations */
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .toast {
        animation: slideInRight 0.3s ease;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    .toast-close {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.8;
        transition: opacity 0.2s;
    }
    
    .toast-close:hover {
        opacity: 1;
    }
    
    /* Enhanced loading states */
    .loading-conversations.error,
    .loading-messages.error {
        color: #dc2626;
    }
    
    .retry-btn {
        background: #00a884;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 8px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background-color 0.2s;
    }
    
    .retry-btn:hover {
        background: #06906e;
    }
    
    /* Date dividers */
    .date-divider {
        display: flex;
        justify-content: center;
        margin: 20px 0 15px 0;
        position: relative;
    }
    
    .date-divider span {
        background: #2a3942;
        color: #aebac1;
        padding: 6px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }
    
    /* Enhanced message status */
    .message-status.read {
        color: #4fc3f7;
    }
    
    .message-status.delivered {
        color: #aebac1;
    }
    
    .message-status.sent {
        color: #aebac1;
    }
    
    /* Unread badge improvements */
    .unread-badge {
        background: #00a884;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 600;
        min-width: 18px;
        text-align: center;
        margin-left: 4px;
    }
    
    /* Conversation item hover effect */
    .conversation-item {
        transition: all 0.2s ease;
        position: relative;
    }
    
    .conversation-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #00a884;
        transform: scaleY(0);
        transition: transform 0.2s ease;
    }
    
    .conversation-item.active::before {
        transform: scaleY(1);
    }
    
    /* Message bubble improvements */
    .message-bubble {
        position: relative;
        transition: all 0.2s ease;
    }
    
    .message-bubble:hover {
        transform: translateY(-1px);
    }
    
    /* Connection status improvements */
    .connection-status {
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    /* Search input focus effect */
    .search-container:focus-within {
        background-color: #3b4a54;
        box-shadow: 0 0 0 2px rgba(0, 168, 132, 0.3);
    }
    
    /* Message input focus effect */
    .message-input-box:focus-within {
        box-shadow: 0 0 0 2px rgba(0, 168, 132, 0.3);
    }
    
    /* Smooth scrolling for messages */
    .messages-container {
        scroll-behavior: smooth;
    }
    
    /* Loading spinner improvements */
    .fa-spinner {
        color: #00a884;
    }
    
    /* Welcome screen improvements */
    .welcome-content {
        animation: fadeIn 0.5s ease;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;

document.head.appendChild(enhancedStyle);