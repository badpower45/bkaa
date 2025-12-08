import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Create new conversation (customer starts chat)
router.post('/conversations', async (req, res) => {
    const { customerId, customerName } = req.body;

    try {
        const sql = `INSERT INTO conversations (customer_id, customer_name, status) VALUES ($1, $2, 'active') RETURNING id`;
        const { rows } = await query(sql, [customerId || null, customerName]);
        res.json({
            message: 'Conversation created',
            conversationId: rows[0].id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all conversations (admin/CS only)
router.get('/conversations', [verifyToken, isAdmin], async (req, res) => {
    const { status, agentId } = req.query;
    let sql = 'SELECT * FROM conversations';
    const params = [];
    let paramIndex = 1;

    if (status || agentId) {
        sql += ' WHERE';
        if (status) {
            sql += ` status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (agentId) {
            sql += status ? ' AND' : '';
            sql += ` agent_id = $${paramIndex}`;
            params.push(agentId);
            paramIndex++;
        }
    }

    sql += ' ORDER BY last_message_at DESC';

    try {
        const { rows} = await query(sql, params);
        res.json({ conversations: rows.map(c => ({
            id: c.id,
            customerId: c.customer_id,
            customerName: c.customer_name,
            agentId: c.agent_id,
            status: c.status,
            createdAt: c.created_at,
            lastMessageAt: c.last_message_at
        })) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get conversation with messages
router.get('/conversations/:id', async (req, res) => {
    const conversationId = req.params.id;

    try {
        const { rows: convRows } = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        
        if (convRows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const conversation = convRows[0];
        const { rows: messages } = await query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC',
            [conversationId]
        );

        res.json({
            conversation: {
                id: conversation.id,
                customerId: conversation.customer_id,
                customerName: conversation.customer_name,
                agentId: conversation.agent_id,
                status: conversation.status,
                createdAt: conversation.created_at,
                lastMessageAt: conversation.last_message_at
            },
            messages: messages.map(m => ({
                id: m.id,
                conversationId: m.conversation_id,
                senderId: m.sender_id,
                senderType: m.sender_type,
                message: m.message,
                timestamp: m.timestamp,
                isRead: m.is_read
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign conversation to agent
router.patch('/conversations/:id/assign', [verifyToken, isAdmin], async (req, res) => {
    const conversationId = req.params.id;
    const { agentId } = req.body;

    try {
        await query(
            'UPDATE conversations SET agent_id = $1 WHERE id = $2',
            [agentId, conversationId]
        );
        res.json({ message: 'Conversation assigned' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Close conversation
router.patch('/conversations/:id/close', [verifyToken, isAdmin], async (req, res) => {
    const conversationId = req.params.id;

    try {
        await query(
            "UPDATE conversations SET status = 'closed' WHERE id = $1",
            [conversationId]
        );
        res.json({ message: 'Conversation closed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send message (backup to Socket.io)
router.post('/messages', async (req, res) => {
    const { conversationId, senderId, senderType, message } = req.body;

    try {
        const { rows } = await query(
            'INSERT INTO messages (conversation_id, sender_id, sender_type, message) VALUES ($1, $2, $3, $4) RETURNING id, timestamp',
            [conversationId, senderId, senderType, message]
        );

        // Update conversation
        await query(
            'UPDATE conversations SET last_message_at = $1 WHERE id = $2',
            [rows[0].timestamp, conversationId]
        );

        res.json({
            message: 'Message sent',
            messageId: rows[0].id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark messages as read
router.patch('/messages/read', async (req, res) => {
    const { conversationId } = req.body;

    try {
        await query(
            "UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_type = 'customer'",
            [conversationId]
        );
        res.json({ message: 'Messages marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
