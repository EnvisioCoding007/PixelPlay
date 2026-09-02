import { Server } from 'socket.io';

let io = null;

export const initSocket = (server, sessionMiddleware) => {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    if (sessionMiddleware) {
        io.use((socket, next) => {
            sessionMiddleware(socket.request, {}, next);
        });
    }

    io.on('connection', (socket) => {
        const req = socket.request;

        if (req.session && req.session.user) {
            const userId = req.session.user._id || req.session.user.id || req.session.user;
            if (userId) {
                socket.join(`user_${userId}`);
            }
        }

        socket.on('register_user', (userId) => {
            const sessionUser = req.session && req.session.user;
            const authenticatedId = sessionUser ? (sessionUser._id || sessionUser.id || sessionUser).toString() : null;
            if (authenticatedId && userId && authenticatedId === userId.toString()) {
                socket.join(`user_${authenticatedId}`);
            }
        });
    });

    return io;
};

export const getIO = () => {
    return io;
};

export const emitToUser = (userId, event, data) => {
    if (!io) return;
    const targetUserId = userId ? userId.toString() : null;
    if (targetUserId) {
        io.to(`user_${targetUserId}`).emit(event, data);
    }
};
