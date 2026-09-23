# 写法示例

## 记录一条漏洞

代码把请求参数直接拼进 SQL：

```javascript
const sql = "SELECT * FROM users WHERE name = '" + req.query.name + "'";
```

报告条目：

```markdown
### [SEC-001] 用户名查询使用字符串拼接

- 严重级别: high
- 类别: SQL 注入
- 位置: `src/users.js:42`
- 置信度: 高
- 问题: 查询语句直接拼接了请求参数 `name`。
- 证据: `src/users.js` 第 42 行使用 `req.query.name` 拼接 SELECT 语句，未见参数绑定。
- 影响: 查询条件可被外部输入改写，存在读取或修改用户表数据的风险。
- 修改建议:
  改前:

  ```javascript
  const sql = "SELECT * FROM users WHERE name = '" + req.query.name + "'";
  ```

  改后:

  ```javascript
  const sql = "SELECT * FROM users WHERE name = ?";
  db.query(sql, [req.query.name]);
  ```
```

改后只保留修复后的查询，不补充探测语句。

## 记录一条优化

```markdown
### [OPT-001] 订单列表在循环中逐条查询明细

- 严重级别: high
- 类别: 数据库查询
- 位置: `src/orders.js:77`
- 置信度: 高
- 问题: `for` 循环对每个订单单独查询一次明细。
- 证据: 第 70 行先取出订单数组，第 77 行在循环体内按 `order.id` 调用 `findItems`。
- 影响: 订单数为 N 时产生 N 次额外查询。列表接口会随页大小线性增加数据库往返。
- 修改建议:
  改前:

  ```javascript
  for (const order of orders) {
    order.items = findItems(order.id);
  }
  ```

  改后:

  ```javascript
  const items = findItemsByOrderIds(orders.map((order) => order.id));
  ```
```

## 记录一条空指针缺陷

```markdown
### [BUG-001] 订单详情在用户为空时直接取名称

- 严重级别: high
- 类别: 空指针
- 位置: `src/order.js:40`
- 置信度: 高
- 问题: `loadUser` 查不到用户时返回 `null`，下一行直接读取 `user.name`。
- 证据: 第 36 行把查询结果赋给 `user`，第 40 行没有空值判断。
- 影响: 订单缺少关联用户时，详情接口会抛出空指针，请求失败。
- 修改建议:
  改前:

  ```javascript
  const user = loadUser(order.userId);
  return user.name;
  ```

  改后:

  ```javascript
  const user = loadUser(order.userId);
  if (user == null) {
    throw new NotFoundError("用户不存在");
  }
  return user.name;
  ```
```

## 记录一条规范问题

项目规范的「必须」写明：捕获异常后不能当作成功。代码捕获后只记日志并返回 `true`，且这没有造成另一类已单列的缺陷时：

```markdown
### [STD-001] 保存失败后仍返回成功

- 严重级别: medium
- 类别: 自定义规范
- 位置: `src/save.js:18`
- 置信度: 高
- 问题: `catch` 中记录日志后返回 `true`。
- 证据: 规范「必须」要求失败不能当作成功；第 18 行的 `catch` 返回 `true`。
- 影响: 调用方会认为保存已完成。
- 修改建议:
  改前:

  ```javascript
  catch (error) {
    log(error);
    return true;
  }
  ```

  改后:

  ```javascript
  catch (error) {
    log(error);
    throw error;
  }
  ```
- 规范条款: code-review-standards.md「必须」：捕获异常后不能忽略并继续当作成功
```

若这处已经按缺陷记录，就不要再写一条规范发现。

## 不写成发现的情况

函数名叫 `data`、文件缺少注释、或者「建议以后加缓存」但没有重复计算证据。这些不要进入报告，除非项目规范明确要求。没有规范文件时，不要编造规范问题。若范围没覆盖到配置中心，写进「未验证项」。
