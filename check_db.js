const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// 打开数据库连接
const db = new sqlite3.Database('./init/MySQLiteDB.db', (err) => {
  if (err) {
    console.error('打开数据库失败:', err.message);
    return;
  }
  console.log('成功连接到数据库');

  // 查询数据库中的所有表
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('查询表失败:', err.message);
      return;
    }
    
    console.log('数据库中的表:', tables);
    
    // 对每个表查询其结构
    tables.forEach(table => {
      db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
        if (err) {
          console.error(`查询表 ${table.name} 结构失败:`, err.message);
          return;
        }
        
        console.log(`表 ${table.name} 的结构:`, columns);
        
        // 查询表中的数据
        db.all(`SELECT * FROM ${table.name} LIMIT 10`, [], (err, rows) => {
          if (err) {
            console.error(`查询表 ${table.name} 数据失败:`, err.message);
            return;
          }
          
          console.log(`表 ${table.name} 的数据:`, rows);
          
          // 如果是最后一个表，关闭数据库连接
          if (table.name === tables[tables.length - 1].name) {
            db.close((err) => {
              if (err) {
                console.error('关闭数据库失败:', err.message);
              } else {
                console.log('数据库连接已关闭');
              }
            });
          }
        });
      });
    });
  });
});