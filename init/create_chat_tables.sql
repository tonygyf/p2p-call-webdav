-- 创建用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    avatar TEXT, -- 存储头像路径或URL
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 创建聊天室表（用于群聊）
CREATE TABLE chat_rooms (
    id INTEGER PRIMARY KEY,
    room_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    creator_id INTEGER,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- System entry for private chats
INSERT INTO chat_rooms (id, room_name, description) VALUES (0, 'Private', 'System private chat room');

-- 创建用户-聊天室关联表
CREATE TABLE user_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
    UNIQUE(user_id, room_id) -- 确保用户不会重复加入同一聊天室
);

-- 创建聊天消息表
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL, -- 0表示私聊，其他值表示群聊房间ID
    content TEXT NOT NULL,
    send_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0, -- 0表示未读，1表示已读
    message_type TEXT DEFAULT 'text', -- 可以是text, image, file等
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
);

-- 创建索引提升查询性能
CREATE INDEX idx_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_messages_room ON chat_messages(room_id);
CREATE INDEX idx_messages_time ON chat_messages(send_time);
CREATE INDEX idx_user_rooms_user ON user_rooms(user_id);
CREATE INDEX idx_user_rooms_room ON user_rooms(room_id);
