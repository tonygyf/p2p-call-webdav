-- 插入测试用户
INSERT INTO users (username, nickname, avatar) VALUES
('alice', 'Alice Smith', '/avatars/alice.jpg'),
('bob', 'Bob Johnson', '/avatars/bob.jpg'),
('charlie', 'Charlie Brown', '/avatars/charlie.jpg'),
('diana', 'Diana Prince', '/avatars/diana.jpg');

-- 插入测试聊天室（群聊）
INSERT INTO chat_rooms (id, room_name, description, creator_id) VALUES
(1, '技术讨论组', '讨论编程和技术问题', 1),
(2, '公司通知群', '发布公司重要通知', 3),
(3, '休闲聊天', '闲聊和娱乐话题', 2);

-- 用户加入聊天室关联数据
INSERT INTO user_rooms (user_id, room_id) VALUES
-- Alice加入的聊天室
(1, 1),
(1, 2),
-- Bob加入的聊天室
(2, 1),
(2, 3),
-- Charlie加入的聊天室
(3, 1),
(3, 2),
(3, 3),
-- Diana加入的聊天室
(4, 2),
(4, 3);

-- 插入测试消息
-- 群聊消息（技术讨论组）
INSERT INTO chat_messages (sender_id, room_id, content, send_time, is_read, message_type) VALUES
(1, 1, '大家好，我是Alice，很高兴加入技术讨论组！', '2023-10-01 09:30:00', 1, 'text'),
(2, 1, '欢迎Alice！我是Bob，主要负责前端开发', '2023-10-01 09:35:00', 1, 'text'),
(3, 1, '欢迎加入，我们最近在讨论数据库优化问题', '2023-10-01 09:40:00', 1, 'text'),

-- 公司通知群消息
(3, 2, '通知：明天上午10点将举行全体员工大会', '2023-10-01 10:00:00', 1, 'text'),
(4, 2, '收到，请问会议地点在哪里？', '2023-10-01 10:05:00', 1, 'text'),
(3, 2, '在公司大会议室，无法参加的同事可以线上参与', '2023-10-01 10:10:00', 0, 'text'),

-- 私聊消息（Alice和Bob）
-- 注意：私聊使用room_id=0，通过消息中的sender_id和接收者关联来实现
INSERT INTO chat_messages (sender_id, room_id, content, send_time, is_read, message_type) VALUES
(1, 0, 'Bob你好，关于昨天的前端问题我有个想法', '2023-10-01 14:00:00', 1, 'text'),
(2, 0, '好的Alice，你说说看', '2023-10-01 14:05:00', 1, 'text'),
(1, 0, '我觉得我们可以尝试使用新的UI组件库', '2023-10-01 14:10:00', 0, 'text');
