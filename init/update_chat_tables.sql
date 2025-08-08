-- 创建消息表，用于存储聊天消息和文件信息
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id TEXT NOT NULL,
    from_user_name TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    to_user_name TEXT NOT NULL,
    message_time INTEGER NOT NULL,
    message_type TEXT NOT NULL, -- 'text' 或 'file'
    message_iv TEXT NOT NULL, -- 加密IV
    message_content TEXT NOT NULL, -- 加密后的消息内容或文件内容
    file_original_name TEXT, -- 文件原始名称（仅文件消息）
    file_size INTEGER, -- 文件大小（仅文件消息）
    file_type TEXT, -- 文件类型（仅文件消息）
    file_id TEXT -- 文件唯一ID（仅文件消息）
);

-- 创建索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(message_time);