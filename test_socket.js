import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('✅ Connected to server');

    // Join as customer
    socket.emit('customer:join', { conversationId: 1, customerName: 'Test Script User' });

    // Send message
    socket.emit('message:send', {
        conversationId: 1,
        senderId: null,
        senderType: 'customer',
        message: 'Hello from test script'
    });
});

socket.on('message:new', (data) => {
    console.log('📩 Received message:', data);
    if (data.message === 'Hello from test script') {
        console.log('✅ Message round-trip successful!');
        process.exit(0);
    }
});

socket.on('connect_error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.log('⏰ Timeout waiting for message');
    process.exit(1);
}, 5000);
