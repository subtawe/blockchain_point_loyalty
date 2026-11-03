# Point Loyalty v3 implementation sequences

Updated 2026-10-16 for monthly D. These current diagrams separate identity deployment, business configuration, escrow stock, and customer delivery. The old v2 diagrams are archived below. Backend integration and external deployment remain separate work. See [D monthly delivery](POINT_D_MONTHLY_DELIVERY.md) for executable call examples and retry rules.

## Create an identity and configure once

```mermaid
sequenceDiagram
autonumber
actor O as Factory and token owner
participant S as Script
participant R as Chain
participant F as Factory or initialized proxy v3
participant T as PointToken
O->>S: name, symbol, optional business and inventory inputs
S->>S: Parse explicit inputs; omitted business means Draft
S->>F: pointTokenVersion(), owner()
F-->>S: 3, signer address
opt Business A selected
S->>R: Read latest chain timestamp before any transaction
S->>S: Reject expired A dates
end
S->>F: deployPointToken(name, symbol)
F->>F: onlyOwner
F->>T: new PointToken(name, symbol, msg.sender)
T-->>F: Empty Draft identity, zero supply
F->>F: Register token and emit TokenDeployed
F-->>S: Execution result and TokenDeployed event
S->>R: tx.wait()
R-->>S: Successful mined receipt
S->>S: Require TokenDeployed from actual factory or proxy
opt Business explicitly selected
S->>T: owner()
T-->>S: signer address
opt Business A
S->>R: Recheck latest timestamp before configure
end
S->>T: configureBusiness(business, ABI-encoded config)
T->>T: onlyOwner, Draft, valid business and config
T->>T: Set immutable business configuration
T-->>S: Execution result and BusinessConfigured event
S->>R: Wait for configuration receipt
R-->>S: Successful mined receipt and logs
S->>S: Require status, token emitter and matching config
end
S-->>O: Report Draft or Configured identity and separate balances
Note over S,T: No default issuance; deploy and configure are separate transactions
```

The proxy runner checks A dates before implementation creation, deploys the proxy with encoded `initialize()`, and follows this identity flow. It rechecks A dates immediately before configuration. Attached ownerless factories reject rather than initialize.

## Issue escrow inventory and deliver customer points

```mermaid
sequenceDiagram
autonumber
actor O as Token owner
participant T as PointToken
participant M as Marketer inventory claim
participant C as Customer ledger
participant R as RPC / Chain
O->>T: mintInventory(marketer, value, issueId)
T->>T: onlyOwner, caller-scoped full-payload operation ID, positive value
T->>M: Increase named claim
T->>T: Mint ERC20 units to token escrow
T-->>O: Execution result and Transfer / InventoryMinted events
O->>R: Wait for inventory receipt
R-->>O: Confirmed status and token emitter
Note over T,M: Draft stock is allowed; Marketer customer balance stays zero
O->>T: sendToCustomer(marketer, customer, value, deliveryConfig, deliveryId)
T->>T: Owner or authorized D Marketer using own inventory, then operation ID, Configured and accounts
alt A
T->>T: Empty config, reject shared expiry already passed
else B or C
T->>T: Decode explicit dates; validate ordered dates and future expiry
else D
T->>T: Decode 64-byte start and expiry from backend
T->>T: Start is current Thai month boundary, expiry is a Thai month start 2 to 13 months ahead
Note over O,T: N is 1 to 12, equal date pairs share a lot, expiry is exclusive
end
T->>M: Debit only named claim; insufficient stock reverts
T->>C: Credit original or new lot attribution if applicable
T->>T: Move escrow units to customer without increasing supply
T-->>O: Execution result and CustomerDelivered / Transfer events
O->>R: Wait for delivery receipt
R-->>O: Confirmed status and token emitter
Note over O,T: Await successful receipt from token; failed delivery rolls back claims and lot creation
```

A direct issuance is `mint(to, value, issueId)`. B/C direct issuance is `mintLot(to, value, startDate, expireDate, issueId)`. D has no direct dated mint. A configuration and B/C lots use inclusive expiry. D lots use exclusive expiry.

## Transfer and redeem Active points

```mermaid
sequenceDiagram
autonumber
actor H as Holder or approved spender
actor O as Token owner
participant T as PointToken
participant R as RPC / Chain
H->>T: transfer(to,value) or transferFrom(from,to,value)
opt transferFrom
T->>T: Spend allowance; all later failures roll it back
end
T->>T: Configured and valid non-escrow accounts
alt A
T->>T: Require startDate <= now <= expireDate
else B, C or D
T->>T: Require recipient consent to actual sender
T->>T: Consume Active lots FEFO, preserve lot dates
end
T->>T: Update ERC20 ledger without changing supply
T-->>H: Execution result and Transfer event
H->>R: Wait for transfer receipt
R-->>H: Confirmed status and token emitter
O->>T: burn(from,value,redemptionId) or redeemFEFO
T->>T: onlyOwner, positive value, caller-scoped operation ID
T->>T: Consume Active customer balance, never inventory or Pending lots
T->>T: Reduce ledger and supply
T-->>O: Execution result and CustomerRedeemed / Transfer events
O->>R: Wait for redemption receipt
R-->>O: Confirmed status and token emitter
Note over H,T: USER_SELECT custom allocations ascend by lotId, not expiry
Note over O,T: Identical operation reuse rejects AlreadyProcessed; changed payload rejects OperationConflict
Note over H,T: Expiry changes availability without a transaction or ledger burn
```

`availableBalanceOf` reports Active customer points. The escrow address returns zero. A `availableSupply` excludes escrow; B/C/D reject the global query. Ordinary zero transfers still follow validity and consent. Custom zero spending and self-transfers reject. Pending lots stay in the live index when expired entries are pruned.

Factory upgrades preserve registry storage and do not change code at existing token addresses. V3 rejects the removed dated and epoch deployment selectors. Receipt emitters for proxy deployment are the actual proxy address, not the implementation address.

## Historical v2 sequence record, 2026-10-02

Everything below is the earlier shared-date-only implementation record. Its dated deploy selector, initial constructor mint, version-2 event, and two-argument mint/burn describe v2 only. Miro was revised on 2026-10-08 with the creation-first draft; it may not include the explicit inventory-source argument added in this implementation. This migration does not edit the board.

อัปเดต 2 ตุลาคม 2026 ตามโค้ดหลัง review/refactor ของ Point repository; Backend integration และ external deployment ยังเป็นงานถัดไป

[Miro: Point sequences](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764685746106189)

- ABI: `deployPointToken(name, symbol, uint256 startDate, uint256 expireDate, initAmount, to)`
- วันที่เป็น Unix seconds และ immutable หนึ่งชุดต่อ Token; mint เพิ่มหรือ transfer ไม่ต่ออายุ
- Active: `startDate <= block.timestamp && block.timestamp <= expireDate`
- Expired: `block.timestamp > expireDate`; ตอนสร้างต้อง `expireDate > block.timestamp`
- `balanceOf` และ `totalSupply` เป็น ledger; available balance/supply คืน 0 นอกช่วง Active
- Create แสดง existing-factory script workflow; scripts ปัจจุบันใช้ signer เป็น initial recipient (`to`) ส่วน contract รับ recipient แยกได้
- สำหรับ deploy_proxy_and_token: preflight dates ก่อน deploy implementation; initialize proxy ผ่าน constructor แบบ atomic; ตรวจ dates อีกครั้งก่อนสร้าง Token
- Mint / Transfer / Burn แสดง execution ภายใน Token ตามลำดับจริงของ OpenZeppelin 5.0.2 และ PointToken._update
- ลูกศร return ใน contract diagrams เป็น Solidity execution result; ผู้ส่ง transaction ต้องรอ mined receipt เพื่อยืนยันผล
- Token address เก่าคง logic เดิม; diagrams นี้อธิบาย date-based version เท่านั้น

## Point · 01 Create

deployPointToken(name, symbol, startDate, expireDate, initAmount, to)

Implemented · Factory ABI v2 · Token owner = ผู้เรียก Factory · Backend integration ยังเป็นงานถัดไป

```mermaid
sequenceDiagram
autonumber
actor O as Factory owner
participant C as Deployment script
participant R as RPC / Chain
participant F as Factory v2
participant T as PointToken
O->>C: name, symbol, dates, initAmount, to
C->>C: readPointDates + readPointFactoryAddress
Note over C,F: Existing factory ต้อง initialized แล้ว; script ไม่ initialize ให้อัตโนมัติ
C->>F: pointTokenVersion() และ owner()
F-->>C: version = 2 และ owner = signer
C->>R: getBlock("latest")
R-->>C: chain timestamp
C->>C: expireDate ต้องมากกว่า chain timestamp
break Input / version / owner / expiry preflight ไม่ผ่าน
C-->>O: throw + exit code 1 ก่อนส่ง transaction
end
C->>R: ส่ง transaction ที่ลงนามโดย Factory owner
R-->>C: transaction hash
R->>F: execute deployPointToken(...)
Note over R,F: ถ้าใช้ AppProxy จะ delegatecall ไป UpgradablePointFactory
F->>F: onlyOwner; startDate < expireDate; expireDate > block.timestamp
break Authorization หรือ dates ไม่ผ่าน
F-->>R: revert OwnableUnauthorizedAccount / InvalidDateRange / PointExpired
end
F->>T: new PointToken(..., to, owner = msg.sender)
T->>T: ตรวจ owner และ dates; เก็บ immutable startDate / expireDate
opt initAmount > 0
T->>T: _mint(to, initAmount) ตรวจ recipient แล้วเข้า _update
Note right of T: เพิ่ม ledger / supply และ emit Transfer(0, to, initAmount)
end
T-->>F: tokenAddress
F->>F: deployedTokens.push(tokenAddress)
Note right of F: emit DatedTokenDeployed พร้อม to / startDate / expireDate
F-->>R: execution สำเร็จ
C->>R: tx.wait()
R-->>C: mined receipt พร้อม status / logs
C->>C: status = 1 และ event emitter = Factory หรือ proxy ที่เรียก
C-->>O: tokenAddress จาก DatedTokenDeployed
Note over C,T: Constructor revert ย้อนทั้ง deployment / registry; token เดิมไม่ถูกเปลี่ยน logic
```

## Point · 02 Mint

mint(to, value) → onlyOwner → _mint → _update → ERC20 ledger

Mint ก่อน startDate ได้ · ใช้ block.timestamp ตอน execute · Mint เพิ่มไม่ต่ออายุ

```mermaid
sequenceDiagram
autonumber
actor O as Token owner
participant T as PointToken
O->>T: mint(to, value)
T->>T: onlyOwner
break caller ไม่ใช่ owner
T-->>O: revert OwnableUnauthorizedAccount
end
T->>T: ERC20._mint ตรวจ to
break to == address(0)
T-->>O: revert ERC20InvalidReceiver
end
T->>T: _update(address(0), to, value)
Note right of T: from = 0 จึงข้าม startDate guard
T->>T: isExpired() = block.timestamp > expireDate
break หมดอายุแล้ว
T-->>O: revert PointExpired
end
T->>T: super._update เพิ่ม totalSupply และ balanceOf(to)
Note right of T: emit Transfer(address(0), to, value)
T-->>O: execution สำเร็จ (ไม่มี return value)
Note over O,T: ทุกยอดใช้ dates เดียวกัน; expireDate ไม่เปลี่ยน
O->>T: availableBalanceOf(to)
alt now < startDate
T-->>O: 0 — Pending
else startDate <= now <= expireDate
T-->>O: balanceOf(to) — Active
else now > expireDate
T-->>O: 0 — Expired
end
Note over O,T: balanceOf และ totalSupply เก็บ ledger แม้หมดอายุ
```

## Point · 03 Transfer

transfer / transferFrom → _transfer → _update → ERC20 ledger

Allowance ก่อน addresses ก่อน date guard ก่อน balance · ทุก revert ย้อน state ทั้ง transaction

```mermaid
sequenceDiagram
autonumber
actor C as Holder / Spender
participant T as PointToken
alt Holder โอนเอง
C->>T: transfer(to, value)
T->>T: from = msg.sender
else Spender โอนแทน
Note over C,T: Holder ต้อง approve ไว้ก่อน
C->>T: transferFrom(from, to, value)
T->>T: _spendAllowance(from, msg.sender, value)
break allowance ไม่พอ
T-->>C: revert ERC20InsufficientAllowance
end
Note right of T: allowance ปกติถูกหัก; MaxUint256 ไม่ถูกลด
end
T->>T: _transfer ตรวจ from / to ไม่ใช่ zero address
break address ไม่ถูกต้อง
T-->>C: revert ERC20InvalidSender / ERC20InvalidReceiver
end
T->>T: _update(from, to, value)
break block.timestamp < startDate
T-->>C: revert PointNotStarted
end
break block.timestamp > expireDate
T-->>C: revert PointExpired
end
T->>T: super._update ตรวจ balanceOf(from) >= value
break balance ไม่พอ
T-->>C: revert ERC20InsufficientBalance
end
T->>T: หักยอด from และเพิ่มยอด to
Note right of T: emit Transfer(from, to, value)
T-->>C: true (Solidity return value)
Note over C,T: Revert ย้อน allowance และ balances; dates / totalSupply ไม่เปลี่ยน
Note over C,T: startDate และ expireDate ใช้ได้; zero / self-transfer ต้อง Active เช่นกัน
```

## Point · 04 Burn

burn(from, value) → onlyOwner → _burn → _update → ERC20 ledger

Burn ต้อง Active · ตรวจ address ก่อน expiry · ไม่มี auto-burn หรือ cron เมื่อแต้มหมดอายุ

```mermaid
sequenceDiagram
autonumber
actor O as Token owner
participant T as PointToken
O->>T: burn(from, value)
T->>T: onlyOwner
break caller ไม่ใช่ owner
T-->>O: revert OwnableUnauthorizedAccount
end
T->>T: ERC20._burn ตรวจ from
break from == address(0)
T-->>O: revert ERC20InvalidSender
end
T->>T: _update(from, address(0), value)
break block.timestamp < startDate
T-->>O: revert PointNotStarted
end
break block.timestamp > expireDate
T-->>O: revert PointExpired
end
T->>T: super._update ตรวจ balanceOf(from) >= value
break balance ไม่พอ
T-->>O: revert ERC20InsufficientBalance
end
T->>T: ลด balanceOf(from) และ totalSupply
Note right of T: emit Transfer(from, address(0), value)
T-->>O: execution สำเร็จ (ไม่มี return value)
Note over O,T: Burn โดย owner ไม่ต้องใช้ allowance
O->>T: isExpired() / availableBalanceOf(from)
alt block.timestamp > expireDate
T-->>O: true / 0
else startDate <= block.timestamp <= expireDate
T-->>O: false / balanceOf(from)
else block.timestamp < startDate
T-->>O: false / 0
end
Note over O,T: Expiry เป็นการเช็คเวลา; ไม่ลบ ledger และไม่ต้องมี transaction
```
