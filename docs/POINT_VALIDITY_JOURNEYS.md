# Point validity journeys แยก Marketer และ End user

## Current v3 status, 9 October 2026

Repository implement flow สร้าง Point ก่อนกำหนด business แล้ว: Factory สร้าง Draft ด้วยชื่อและ symbol, Token owner ตั้ง A/B/C/D ครั้งเดียว และออก inventory หรือ Customer points แยกจาก deployment. การแจกจาก stock ต้องระบุ `inventoryAccount` เพื่อหักเฉพาะ claim ของ Marketer นั้น. Inventory ใช้ไม่ได้และอยู่ใน escrow; Customer ledger ไม่รวม inventory claim.

A ตั้งวันร่วมกันหลัง deploy; B/C ใช้ล็อตแบบ inclusive; D ใช้ต้นเดือนไทยที่แจกและหมดอายุที่ต้นเดือนไทยถัดไป N+1 เดือน โดยเลือก N ต่อการส่งได้ 1 ถึง 12 เดือนและ expiry เป็น exclusive คู่วันที่เดียวกันรวมเป็นล็อตเดียว Backend ส่ง timestamp สองค่าและ contract ตรวจทั้ง Owner กับ Marketer ดู [ตัวอย่าง D รายเดือน](POINT_D_MONTHLY_DELIVERY.md) ทุก custom issuance/redemption ใช้ operation ID Standard ERC20 transfer และ transferFrom ไม่ข้ามกติกาล็อต Backend, marketplace adapter และ external deployment ยังไม่ได้ implement ในรอบนี้

อ่าน API/sequence ปัจจุบันจาก [README](../README.md#point-loyalty-v3-lifecycle-and-abi) และ [v3 sequences](POINT_DATE_VALIDITY_SEQUENCES.md). บอร์ด Miro วันที่ 8 ตุลาคมยังเป็นแบบร่างก่อนเพิ่ม inventory source; วันนี้ไม่ได้แก้บอร์ด.

## Historical role journeys, 6 October 2026

ตัวอย่างและลิงก์ด้านล่างเก็บเป็น record เดิม. Flow ที่เลือกกติกาตอน deploy, mint/burn ที่ไม่มี operation ID และข้อความว่า B/C ยังไม่ implement ไม่ใช่สถานะ v3 ปัจจุบัน.

อัปเดต 6 ตุลาคม 2026 ตาม Asia/Bangkok

สองนโยบายวันหมดอายุ พร้อมสามรูปแบบ journey:

- **A: หมดอายุพร้อมกันทั้ง Token**. อ้างอิง NewPointToken ปัจจุบันที่กำหนด immutable startDate / expireDate ตอนสร้าง; mint ไม่รับวันใหม่
- **B: แยกล็อต + FEFO อัตโนมัติ**. design proposal ยังไม่ implement; วันอยู่ระดับ lot; ผู้ส่งระบุผู้รับและจำนวน แล้ว contract เลือก Active lot ที่หมดอายุก่อน
- **C: แยกล็อต + เลือกล็อตตอนโอน**. design proposal เพิ่มเติม; ผู้ส่งเลือก lotId และจำนวนจากแต่ละล็อต; ใช้ได้เฉพาะโปรแกรมที่อนุญาต manual transfer; การใช้แต้มยังเป็น redeemFEFO

C ใช้นโยบายวันแยกล็อตเหมือน B แต่เปลี่ยนวิธีเลือกล็อตสำหรับ transfer. โปรแกรมกำหนด transferSelectionPolicy ตอนสร้างเป็น FEFO_ONLY หรือ USER_SELECT. FEFO_ONLY รับเฉพาะการโอนแบบอัตโนมัติ; USER_SELECT เปิดทั้งการโอนอัตโนมัติและเลือกล็อตเอง. Policy นี้เป็นข้อเสนอ immutable สำหรับรุ่นใหม่ ไม่ได้เพิ่มใน Factory v2 ที่มีอยู่.

Service / UI ใน journey เป็น integration ที่เสนอ ไม่ใช่การยืนยันว่า Backend implement แล้ว
ตัวเลขเป็นหน่วยแต้มเพื่ออธิบาย; integration ต้องแปลงเป็น token base units ตาม decimals ก่อนเรียก ABI
วันที่ในตัวอย่างเป็นปี 2026 ตาม Asia/Bangkok; startDate เริ่มวันเวลา 00:00:00 และ expireDate สิ้นวันเวลา 23:59:59
API รับ Unix seconds; Oct05 / Oct31 / Dec31 ใน sequence เป็นชื่อย่อของ timestamp ไม่ใช่ชนิด string
ธุรกรรมตรวจ block.timestamp ตอน execute; eth_call ใช้เวลาของ block ที่อ่าน; quote จึงอาจต่างจากผลตอนส่งจริง
ลูกศร confirmed receipt ย่อขั้นตอนอ่าน receipt ผ่าน RPC และตรวจ status / event emitter
FEFO proposal ฉบับเต็ม: [POINT_FEFO_DESIGN.md](POINT_FEFO_DESIGN.md)

## บทบาทและสิทธิ์ใน journey

Marketer เป็นผู้กำหนดโปรแกรมและกติกาออกแต้มในธุรกิจ. การสร้าง Token หรือโปรแกรมเป็นคนละขั้นกับการ mint แต้มให้สมาชิก. End user รับแต้ม ตรวจยอด โอนแต้มของตนเอง และขอใช้แต้มแลกรางวัล.

| งาน | Marketer | End user | ผู้ส่งธุรกรรมบน chain |
| --- | --- | --- | --- |
| สร้าง Token หรือโปรแกรม | กำหนดชื่อ วันของ A หรือ policy ของ B/C | ไม่มีขั้นตอนสร้าง | Admin service ใช้ signer ที่มีสิทธิ์ owner ของ Factory |
| ออกแต้มด้วย mint หรือ mintLot | กำหนดผู้รับ จำนวน และวันล็อตของ B/C | รับแต้มและดูยอด | Admin service ใช้ signer ที่เป็น owner ของ Token หรือโปรแกรม |
| โอนแต้ม | กำหนด policy ตอนสร้าง B/C | ระบุผู้รับและจำนวน หรือเลือกล็อตใน C | Wallet ของผู้ส่งลงนามโอนยอดของตนเอง |
| ขอแลกรางวัล | จัดกติการางวัลและให้ service ดำเนินคำขอ | เลือกรางวัลและส่งคำขอ redeem | Redemption service ใช้ owner signer เรียก burn หรือ redeemFEFO |
| ส่งรางวัลและติดตามผล | Service ตรวจ receipt และกระทบยอดการส่งรางวัลภายนอก | รับผลคำขอและรางวัล | การส่งรางวัลภายนอกแยกจากธุรกรรมแต้ม |
| ตรวจยอดและวันหมดอายุ | ตรวจรายงานการออกและใช้แต้ม | ดูยอดใช้ได้และประวัติแต้มหมดอายุ | อ่านผ่าน RPC ไม่ต้องใช้ owner signer |

Marketer เป็นบทบาทธุรกิจ ไม่ได้หมายความว่าบัญชีของ Marketer มีสิทธิ์ on-chain โดยอัตโนมัติ. Admin service และ Redemption service ใน diagram ต้องใช้ signer ที่ตรงกับ owner ของ contract นั้น. สำหรับ Factory v2 ผู้เรียก deploy ที่มีสิทธิ์ Factory owner จะเป็น owner ของ Token ใหม่. พารามิเตอร์ `to` เป็นผู้รับ initial mint ไม่ใช่ตัวกำหนด owner. ตัวอย่างใช้ initial amount เป็น 0 แล้วแยก mint ภายหลัง. Factory v3 ยังเป็นข้อเสนอ และ journey นี้คงโมเดล owner เป็นผู้เรียก deploy โดยไม่เพิ่มทางเลือกเจ้าของใหม่.

Admin service ที่เสนอต้องตรวจสิทธิ์ Marketer ต่อโปรแกรมและผู้รับก่อนใช้ owner signer. Redemption service ต้องตรวจบัญชีสมาชิกและสิทธิ์ต่อ order ก่อนหักแต้ม. Role ที่ระบุใน request หรือในหน้า UI อย่างเดียวไม่ใช่หลักฐานอนุญาตให้ service ส่ง transaction.

End user ลงนามโอนด้วย wallet ของตนเอง. End user ขอ redeem ผ่าน service. Wallet ที่ไม่ได้เป็น owner เรียก mint, burn หรือ redeemFEFO โดยตรงไม่ได้ แม้หักจากบัญชีของตนเอง. ใน C Marketer กำหนด USER_SELECT ตอนสร้างโปรแกรม ส่วน End user เป็นผู้เลือกล็อตที่จะส่ง. B/C ใช้หนึ่งโปรแกรมที่มีหลายล็อต ไม่สร้าง Token ใหม่ทุกครั้งที่ออกล็อต.

ทุกแบบใช้ขั้นตอนจัดการคำขอแลกรางวัลร่วมกัน. End user เริ่มคำขอไปยัง Redemption service. Service ตรวจผู้ใช้และ order พร้อมกันคำขอซ้ำก่อนให้ owner signer ส่งธุรกรรมหักแต้ม. Service ดำเนินคำขออัตโนมัติตามกติกาโปรแกรมได้ โดย Marketer ไม่ต้องกดอนุมัติหรือ burn เองทุก order. Service ยืนยัน receipt ผ่าน RPC โดยตรวจ status และ event emitter ก่อนส่งรางวัล แล้วกระทบยอดการส่งรางวัลกับ order ภายนอก. A ใช้ `burn` ที่ไม่มี operationId จึงต้องตรวจ receipt ก่อน retry. B/C เสนอ stable operationId สำหรับ `redeemFEFO`. หากหักแต้มแล้วส่งรางวัลไม่สำเร็จ ต้องติดตามและจัดการชดเชยตามนโยบายธุรกิจ. Journey นี้ไม่ได้เพิ่ม refund API หรือรับรองว่า settlement ข้ามระบบเป็น atomic.

Miro role journeys สร้างเพิ่มเติมวันที่ 6 ต.ค. 2026 หลังเทียบสเก็ตช์สามแบบและเลือก swimlane ที่วางช่วงเวลาให้ตรงกัน. แต่ละแบบมี Marketer, End user และแถว Service execution ที่ระบุผู้ลงนาม. ตรวจข้อมูลที่บันทึกจริงและขนาดที่ Miro วัดกลับแล้ว; ไม่ได้เปลี่ยน contract หรือ implement App/service.

- [เปิดหน้าเลือก Journey A/B/C ใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686145124914)
- [A · Marketer และ End user](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686145056940)
- [B · Marketer และ End user](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686145056941)
- [C · Marketer และ End user](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686145056942)

ลิงก์ Miro ใน sequence ด้านล่างยังอ้าง widget รายละเอียดเดิมของ A/B. ชุด role journeys ข้างต้นเป็นภาพรวมที่เพิ่มใหม่และรวม C ด้วย.

## ตัวอย่างเปรียบเทียบ

| ช่วง journey | A: ทั้ง Token หมด 31 ธ.ค. | B: โอน FEFO, A หมด ต.ค., B หมด ธ.ค. | C: เลือกโอน B40, วันล็อตตามแบบ B |
| --- | --- | --- | --- |
| 5 ต.ค. Mint 100 + 10 ต.ค. Mint 50 | Alice 150 วันหมดเดียวกัน | Alice A100 + B50 | Alice A100 + B50 |
| 15 ต.ค. Alice โอน Bob 40 | Alice 110 / Bob 40 | Alice A60+B50 / Bob A40 | เลือก B40; Alice A100+B10 / Bob B40 |
| 20 ต.ค. Alice ใช้ 80 | Alice 30 / Bob 40 | ตัด A60+B20; Alice B30 / Bob A40 | redeemFEFO ตัด A80; Alice A20+B10 / Bob B40 |
| 1 พ.ย. ยอดใช้ได้ | Alice 30 / Bob 40 | Alice 30 / Bob 0 | Alice 10 / Bob 40 |
| 1 ม.ค. 2027 ยอดใช้ได้ | ทั้งคู่ 0 | ทั้งคู่ 0 | ทั้งคู่ 0 |

หลังใช้สำเร็จ ledger Alice30 / Bob40 และ supply70 อยู่ต่อแม้หมดอายุทั้งสาม journey ไม่ burn อัตโนมัติ. ใน C ผู้ส่งจงใจเลือกล็อตอายุยาวกว่า จึงมีผลต่อยอดที่ยังใช้ได้หลัง ต.ค. การโอนแบบนี้ไม่บังคับ FEFO แม้การ redeem ยังคง FEFO.
FEFO เป็นกฎเลือกล็อต ไม่ใช่กฎตั้งวันหมดอายุ; business เป็นผู้กำหนดวันให้แต่ละล็อต
หาก mint หลายครั้งด้วย dates เดียวกันในโปรแกรมเดียวกัน สามารถรวม lotId ได้

## A · หมดอายุพร้อมกันทั้ง Token

### Marketer · สร้าง Token และออกแต้ม

#### สร้าง Token แล้วออกแต้ม

แบบหมดอายุพร้อมกันทั้ง Token · Contract มีแล้ว · Service เป็น integration journey

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716878)

```mermaid
sequenceDiagram
autonumber
actor O as Marketer
participant S as Admin service / Script
participant F as Point Factory v2
participant T as NewPointToken
O->>S: สร้างชุดแต้ม เริ่ม 1 ต.ค. หมด 31 ธ.ค.
S->>F: deployPointToken(name,symbol,startDate,expireDate,0,to)
F->>F: onlyOwner และตรวจช่วงวันที่
F->>T: new Token(..., owner = caller)
T->>T: บันทึก startDate / expireDate แบบ immutable
F-->>S: DatedTokenDeployed + tokenAddress
Note over S,T: ต่อจากนี้ mint ทุกครั้งใช้วันเดียวกันของ Token
O->>S: 5 ต.ค. ให้ Alice 100 แต้ม
S->>T: mint(Alice,100) โดย token owner
T->>T: onlyOwner; recipient ถูกต้อง; ยังไม่ Expired
T->>T: เพิ่ม balance และ supply 100
T-->>S: Transfer event ใน confirmed receipt
O->>S: 10 ต.ค. ให้ Alice เพิ่ม 50 แต้ม
S->>T: mint(Alice,50)
T->>T: ตรวจสิทธิ์และวัน แล้วเพิ่ม balance / supply
S->>T: availableBalanceOf(Alice)
T-->>S: available = 150
S-->>O: ยืนยันออกแต้มรวม 150 ให้ Alice พร้อมวันของ Token ที่สร้าง
Note over S,T: ไม่มี lotId; mint ครั้งหลังไม่ได้เริ่มอายุใหม่
Note over S,T: ลูกศร receipt ย่อการรอผลจาก chain RPC
```

ตัวอย่างสมมติปี 2026 · วันที่ตาม Asia/Bangkok · expireDate = 23:59:59 ของวันนั้น · API รับ Unix seconds

### End user · รับ โอน และใช้แต้ม

#### รับแต้มและตรวจยอด

หลัง service ออกแต้มให้ Alice 100 ในวันที่ 5 ต.ค. และอีก 50 ในวันที่ 10 ต.ค. Alice ตรวจยอดใน wallet ของตนเอง.

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant U as Proposed App
participant R as Chain RPC
participant T as NewPointToken
A->>U: เปิดดูแต้มที่ได้รับ
U->>R: อ่าน availableBalanceOf(Alice), balanceOf(Alice), getPointDates และ validityStatus
R->>T: eth_call ณ block ที่อ่าน
T-->>R: ledger / available 150; dates 1 ต.ค. ถึง 31 ธ.ค.; status Active
R-->>U: ยอดพร้อม block ของข้อมูล
U-->>A: แสดงยอดที่ใช้ได้และวันหมดอายุ
```

App และ service เป็น integration ที่เสนอ. การอ่านยอดแยกจากขั้นตอนออกแต้มของ Marketer.

#### โอนแต้มแล้วขอแลกรางวัล

15 ต.ค. โอน 40 → 20 ต.ค. ใช้ 80 · ทั้งหมดอ้างวันของ Token เดียวกัน

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716879)

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant T as NewPointToken
actor B as Bob
participant S as Redemption service
Note over A,B: เริ่มต้น Alice = 150 / Bob = 0
A->>T: 15 ต.ค. transfer(Bob,40)
T->>T: ตรวจ recipient; startDate <= block.timestamp <= expireDate
T->>T: ตรวจ balance แล้วหัก Alice 40 / เพิ่ม Bob 40
T-->>A: confirmed receipt + Transfer event
B->>T: availableBalanceOf(Bob)
T-->>B: 40 แต้ม หมด 31 ธ.ค.
Note over A,T: Alice เหลือ 110; supply ยังเป็น 150
A->>S: 20 ต.ค. ขอใช้ 80 แต้มกับ order
S->>S: ตรวจ user / order; กันคำขอซ้ำใน service
S->>T: burn(Alice,80) โดย token owner
T->>T: onlyOwner; ตรวจ sender; ตรวจช่วง Active
alt ยอดพอและยัง Active ตอน execute
T->>T: หัก Alice 80; ลด totalSupply 80
T-->>S: confirmed receipt + Transfer to zero
S-->>A: ตัดแต้มสำเร็จ เหลือ 30
else ยังไม่เริ่ม / หมดอายุ / ยอดไม่พอ
T-->>S: revert ทั้ง transaction
S-->>A: ตัดแต้มไม่สำเร็จ
end
Note over A,B: เส้นทางสำเร็จ: Alice = 30 / Bob = 40 / supply = 70
Note over S,T: burn ปัจจุบันไม่มี operationId; retry ต้อง reconcile receipt
```

Redemption service ต้องมีสิทธิ์ token owner · การส่ง reward ภายนอกต้อง reconcile แยกจากธุรกรรมแต้ม

#### ตรวจยอดและหมดอายุทั้ง Token

1 พ.ย. ยังใช้ได้ทั้งคู่ → 1 ม.ค. 2027 ทุกยอดของ Token นี้ใช้ไม่ได้

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716880)

```mermaid
sequenceDiagram
autonumber
actor U as Member / App
participant R as Chain RPC
participant T as NewPointToken
Note over U,T: หลังโอนและใช้: ledger Alice = 30 / Bob = 40
U->>R: 1 พ.ย. อ่าน availableBalanceOf ของทั้งคู่
R->>T: eth_call ณ block ที่เลือก
T->>T: isActive() ใช้ block.timestamp ของ block นั้น
T-->>R: Alice = 30 / Bob = 40
R-->>U: แสดงแต้มที่ใช้ได้ ณ block ที่อ่าน
Note over U,T: ไม่ต้องมี cron มาสั่งให้ Token หมดอายุ
U->>R: 1 ม.ค. 2027 อ่านยอดอีกครั้ง
R->>T: availableBalanceOf / balanceOf / validityStatus
T->>T: block.timestamp > expireDate
T-->>R: Available ทั้งคู่ = 0; status = Expired
T-->>R: balanceOf Alice = 30 / Bob = 40; totalSupply = 70
R-->>U: แสดงยอดใช้ได้ 0 พร้อมประวัติยอดหมดอายุ
U->>T: ลอง transfer หลังหมดอายุ
T-->>U: revert PointExpired
Note over U,T: mint และ burn โดย owner ก็ถูกปฏิเสธหลัง expireDate
Note over R,T: ที่ expireDate พอดียัง Active; expireDate + 1 จึง Expired
Note over U,T: จะออกชุดใหม่ที่วันต่างกัน ต้องสร้าง Token ใหม่
```

ขอบเขตวันแบบ inclusive: startDate ≤ block.timestamp ≤ expireDate · ไม่ได้ลบ balance หรือ burn อัตโนมัติ

## B · แยกล็อตและโอน FEFO อัตโนมัติ

### Marketer · สร้างโปรแกรมและออกล็อต

#### สร้างโปรแกรมแล้วออกแต้ม

แบบ FEFO · Proposed v3. ยังไม่ลงโค้ด · แต่ละล็อตมี startDate / expireDate ของตัวเอง

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716881)

```mermaid
sequenceDiagram
autonumber
actor O as Marketer
participant S as Admin service
participant F as Proposed Factory v3
participant P as Proposed Point program
O->>S: สร้างโปรแกรมแต้มแบบมีล็อต
S->>F: deployPointProgram(name,symbol,FEFO_ONLY)
F->>F: onlyOwner; ตรวจ policy ที่เสนอ
F->>P: สร้างโปรแกรมว่าง; owner = caller; ไม่มีวันหมดอายุรวม
F-->>S: programAddress
O->>S: 5 ต.ค. ให้ Alice 100 หมด 31 ต.ค.
S->>P: mintLot(Alice,100,Oct05,Oct31,op1)
P->>P: onlyOwner; validate dates / amount / recipient / operation
P->>P: สร้างหรือหา lotId จาก dates; ตรวจ wallet capacity
P->>P: เพิ่มล็อต A = 100; ledger / supply เพิ่ม 100
P-->>S: confirmed receipt + lot allocation
O->>S: 10 ต.ค. ให้ Alice 50 หมด 31 ธ.ค.
S->>P: mintLot(Alice,50,Oct10,Dec31,op2)
P->>P: ตรวจเงื่อนไข แล้วเพิ่มล็อต B = 50
P-->>S: confirmed receipt + lot allocation
S->>P: availableBalanceOf(Alice)
P->>P: รวมเฉพาะล็อต Active ณ block.timestamp
P-->>S: available = 150
S-->>O: ยืนยันออกแต้มสองล็อตให้ Alice
Note over S,P: dates เหมือนกันรวม lotId ได้; ไม่จำเป็นต้องมีล็อตใหม่ทุก mint
Note over S,P: Retry ใช้ operationId เดิม; service ตรวจ receipt และคืนผลเดิม
```

วันและจำนวนเป็นตัวอย่างสมมติปี 2026 · วันที่ตาม Asia/Bangkok · expireDate = สิ้นวัน · API รับ Unix seconds

### End user · รับ โอน และใช้แต้ม

#### รับแต้มและตรวจยอด

หลัง service ออกแต้มให้ Alice 100 ในวันที่ 5 ต.ค. และอีก 50 ในวันที่ 10 ต.ค. Alice ตรวจยอดใน wallet ของตนเอง.

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant U as Proposed App
participant R as Chain RPC
participant T as Proposed Point program
A->>U: เปิดดูแต้มที่ได้รับ
U->>R: อ่าน availableBalanceOf(Alice) และ wallet lots แบบ pagination
R->>T: eth_call ณ block ที่อ่าน
T-->>R: available 150; wallet lot data A100 หมด 31 ต.ค. / B50 หมด 31 ธ.ค.
R-->>U: ยอดพร้อม block ของข้อมูล
U-->>A: แสดงยอดที่ใช้ได้และวันหมดอายุ
```

App และ service เป็น integration ที่เสนอ. การอ่านยอดแยกจากขั้นตอนออกแต้มของ Marketer. availableBalanceOf คืนจำนวนรวม; รายละเอียด lotId, balance และ dates มาจาก wallet lot read API ที่ยังเป็นข้อเสนอ.

#### โอน FEFO แล้วขอแลกรางวัล

15 ต.ค. โอน A40 → 20 ต.ค. ใช้ A60 + B20 · วันหมดอายุไม่เริ่มใหม่เมื่อโอน

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716882)

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant P as Proposed Point program
actor B as Bob
participant S as Redemption service
Note over A,B: เริ่มต้น Alice: A100 + B50 / Bob: 0
B->>P: allowSender(Alice,true)
A->>P: 15 ต.ค. transferFEFO(Bob,40,op3)
P->>P: ตรวจ sender / amount / opt-in / operationId
P->>P: selectFEFO(Alice,40,block.timestamp) ได้ A40
P->>P: ตรวจยอดพอ และ receiver capacity ทั้งชุด
P->>P: หัก Alice A40; เพิ่ม Bob A40; บันทึก operation
P-->>A: confirmed receipt + allocation A40
Note over P,B: Bob ได้ A40 หมด 31 ต.ค. เหมือนเดิม
Note over A,P: Alice เหลือ A60 + B50; supply ยังเป็น 150
A->>S: 20 ต.ค. ขอใช้ 80 แต้มกับ order
S->>S: ตรวจ user / order; ใช้ stable operationId
S->>P: redeemFEFO(Alice,80,op4) โดย owner
P->>P: ตรวจ onlyOwner / amount / operation; เลือก FEFO
P->>P: A หมดก่อน: take 60; ต่อด้วย B: take 20
alt Active พอ 80 และผ่านทุกเงื่อนไข
P->>P: หัก A60 + B20; ลด ledger / supply 80; mark processed
P-->>S: confirmed receipt + allocations
S-->>A: ใช้ 80 สำเร็จ เหลือ B30
else Active ไม่พอ หรือ validation ไม่ผ่าน
P-->>S: revert ทั้ง transaction ไม่หักบางล็อต
S-->>A: ตัดแต้มไม่สำเร็จ
end
Note over A,B: สำเร็จ: Alice B30 / Bob A40 / supply 70
Note over S,P: Reward ภายนอกต้อง reconcile แยก; ไม่มี atomic settlement ข้ามระบบ
```

Selector เรียง expireDate แล้ว lotId · ข้าม Pending / Expired / ยอดศูนย์ · ต้องหักครบจึงเขียน state

#### ตรวจยอดและหมดอายุแยกล็อต

1 พ.ย. Bob A40 หมดอายุ แต่ Alice B30 ยังใช้ได้ · โปรแกรมยังรับล็อตใหม่ต่อได้

[เปิดใน Miro](https://miro.com/app/board/uXjVEf-WvPA=/?moveToWidget=3458764686005716883)

```mermaid
sequenceDiagram
autonumber
actor U as Member / App
participant R as Chain RPC
participant P as Proposed Point program
Note over U,P: หลังโอนและใช้: Alice B30 / Bob A40
U->>R: 1 พ.ย. อ่าน availableBalanceOf ของทั้งคู่
R->>P: eth_call ณ block ที่เลือก
P->>P: อ่าน block.timestamp แล้วตรวจวันของแต่ละล็อต
P->>P: A หมด 31 ต.ค. ข้าม; B หมด 31 ธ.ค. ยัง Active
P-->>R: Available Alice = 30 / Bob = 0
P-->>R: Ledger Alice = 30 / Bob = 40; supply = 70
R-->>U: แสดง available และ expired แยกกัน
U->>P: Bob ลอง transferFEFO 1 แต้ม
P->>P: selectFEFO ข้าม A ที่ Expired
P-->>U: revert InsufficientAvailablePoints
Note over U,P: ไม่ต้องมีธุรกรรมมาปิดล็อตก่อนจึงจะใช้ไม่ได้
U->>R: 1 ม.ค. 2027 อ่านยอดอีกครั้ง
R->>P: availableBalanceOf ของทั้งคู่
P->>P: B หมดอายุแล้วเช่นกัน
P-->>R: Available ทั้งคู่ = 0; ledger และ supply ยังเดิม
R-->>U: แสดงยอดใช้ได้ 0
Note over R,P: Active เมื่อ startDate <= block.timestamp <= expireDate
Note over R,P: การ mint ล็อตใหม่ทำได้เมื่อ dates ใหม่ผ่าน validation
Note over U,P: อ่าน index ไม่เกิน cap ที่เสนอ 32; ต้อง benchmark ก่อน implement
```

ไม่มี cron บังคับ · prune ลบเฉพาะรายการใน index ไม่ลบ expired ledger · FEFO เป็นข้อเสนอ ยังไม่ใช่ ERC20 API เดิม

## C · แยกล็อตและเลือกล็อตตอนโอน

### Marketer · สร้างโปรแกรมและออกล็อต

#### สร้างโปรแกรมแล้วออกแต้ม

Proposed lot program ที่มี transferSelectionPolicy = USER_SELECT. Marketer เลือก policy นี้ตอน deploy. วันและจำนวนการออกแต้มตรงกับ B. Policy ไม่เปลี่ยนภายหลังจากออกแต้มแล้ว.

```mermaid
sequenceDiagram
autonumber
actor O as Marketer
participant S as Admin service
participant F as Proposed Factory v3
participant P as Proposed Point program
O->>S: สร้างโปรแกรมแต้มที่ให้ผู้ใช้เลือกล็อตตอนโอน
S->>F: deployPointProgram(name,symbol,USER_SELECT)
F->>F: onlyOwner; ตรวจ policy ที่เสนอ
F->>P: สร้างโปรแกรมว่าง; owner = caller; ไม่มีวันหมดอายุรวม
F-->>S: programAddress
O->>S: 5 ต.ค. ให้ Alice 100 หมด 31 ต.ค.
S->>P: mintLot(Alice,100,Oct05,Oct31,op1)
P->>P: onlyOwner; validate dates / amount / recipient / operation
P->>P: สร้างหรือหา lotId จาก dates; ตรวจ wallet capacity
P->>P: เพิ่มล็อต A100; ledger / supply เพิ่ม 100
P-->>S: confirmed receipt + lot allocation
O->>S: 10 ต.ค. ให้ Alice 50 หมด 31 ธ.ค.
S->>P: mintLot(Alice,50,Oct10,Dec31,op2)
P->>P: ตรวจเงื่อนไข แล้วเพิ่มล็อต B50
P-->>S: confirmed receipt + lot allocation
S->>P: availableBalanceOf(Alice)
P-->>S: available = 150
S-->>O: ยืนยันออกแต้มสองล็อตให้ Alice
Note over S,P: dates เหมือนกันรวม lotId ได้; ไม่สร้าง Token ใหม่ต่อ lot
Note over S,P: Retry ใช้ operationId เดิมและ reconcile receipt
```

USER_SELECT อนุญาตให้ผู้ใช้เลือก transferLots หรือให้ระบบโอนด้วย transferFEFO. การ redeem ยังคงเลือก FEFO อัตโนมัติ. Marketer ไม่เลือกล็อตแทนผู้ส่ง.

### End user · รับ เลือกล็อต โอน และใช้แต้ม

#### รับแต้มและเลือกล็อตที่จะส่ง

Alice ได้รับ A100 และ B50 จาก Marketer แล้ว. เมื่อเปิดส่งแต้ม App อ่าน policy และยอดแต่ละล็อตเพื่อให้ Alice เลือก. UI และ read API ในขั้นตอนนี้ยังเป็นข้อเสนอ.

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant U as Proposed App
participant R as Chain RPC
participant P as Proposed Point program
A->>U: เปิดส่งแต้ม ระบุ Bob เป็นผู้รับ
U->>R: อ่าน policy และ wallet lots แบบ pagination
R->>P: eth_call ณ block ที่อ่าน
P-->>R: USER_SELECT; lotId, balance, startDate, expireDate
R-->>U: ข้อมูลพร้อม asOfBlock / asOfTime
U-->>A: แสดง A100 หมด 31 ต.ค. และ B50 หมด 31 ธ.ค.
Note over U,P: Pending เลือกโอนไม่ได้; Expired ดูจากประวัติแยก
A->>U: เลือกล็อต B จำนวน 40
U->>U: สร้าง allocations = [(lotIdB,40)] และ total = 40
U->>U: ตรวจจำนวนบวก, unique lotId; เรียง payload ตาม lotId
U-->>A: ยืนยัน Bob รับ B40 หมด 31 ธ.ค. ตามวันเดิม
Note over A,U: ผู้ใช้เลือกได้หนึ่งหรือหลายล็อต; ผลรวมเป็นจำนวนที่จะส่ง
Note over U,P: Preview ไม่รับรองผล; contract ตรวจข้อมูลจริงตอน execute
```

การอ่านเป็น read API ที่เสนอสำหรับรุ่นใหม่. ต้องแบ่งหน้าและตรวจ block ของข้อมูลที่ใช้ preview. Expired ที่ prune จาก wallet index อ่านจากประวัติหรือ indexer แยก ไม่วน lot registry ทั้งหมด. UI แสดงวันที่และยอดของแต่ละล็อตก่อนยืนยัน รวมทั้งเตือนว่าการส่งล็อตอายุยาวออกไปทำให้ผู้ส่งเหลือล็อตใกล้หมดอายุ. operationId เป็นข้อมูลระบบ ผู้ใช้ไม่ต้องกรอก.

#### โอนล็อตที่เลือกแล้วขอแลกรางวัลแบบ FEFO

15 ต.ค. Alice เลือกส่ง B40 โดยไม่ส่ง A ที่หมดก่อน. 20 ต.ค. การ redeem ยังเลือก A80 ตาม FEFO.

```mermaid
sequenceDiagram
autonumber
actor A as Alice
participant U as Proposed App
participant P as Proposed Point program
actor B as Bob
participant S as Redemption service
Note over A,B: เริ่มต้น Alice A100+B50 / Bob 0; policy USER_SELECT
B->>P: allowSender(Alice,true)
A->>U: ยืนยันส่งล็อต B40 ให้ Bob
U->>A: เตรียม transferLots(Bob,[(lotIdB,40)],op5) ให้ลงนาม
A->>P: ส่ง transaction โดย msg.sender = Alice
P->>P: ตรวจ policy / sender / recipient / opt-in / operationId
P->>P: ตรวจ allocations nonempty, bounded, unique, canonical และทุก value > 0
loop ทุกล็อตที่ผู้ส่งเลือก
P->>P: ตรวจ lotId มีจริง, Active ณ block.timestamp และ balance ของ Alice พอ
end
P->>P: prune recipient index และตรวจ capacity หลังรับ allocations ทั้งชุด
alt ทุกเงื่อนไขผ่าน
P->>P: หัก Alice B40; เพิ่ม Bob B40 พร้อม dates เดิม
P->>P: ปรับ ledger balances; supply คงเดิม; mark operation
P-->>U: confirmed receipt + caller / operationId / lot allocations
U-->>A: ส่งสำเร็จ Alice A100+B10 / Bob B40
else policy / lot / balance / recipient ไม่ผ่าน
P-->>U: revert ทั้ง transaction ไม่เปลี่ยน balance / supply / operation record
U-->>A: ส่งไม่สำเร็จ แสดงเหตุผลและให้ตรวจรายการใหม่
end
Note over U,P: หากล็อตที่เลือกใช้ไม่ได้ จะไม่สลับไปล็อตอื่นอัตโนมัติ
Note over U,P: Retry payload เดิมใช้ op5 เดิมและ reconcile receipt
Note over A,B: ส่วนต่อไปสมมติว่า transfer สำเร็จ; supply ยังเป็น 150
A->>S: 20 ต.ค. ขอใช้ 80 แต้มกับ order
S->>P: redeemFEFO(Alice,80,op6) โดย owner
P->>P: เลือก Active FEFO ได้ A80; ตรวจว่าหักครบ
P->>P: หัก A80; ลด ledger / supply 80; mark operation
P-->>S: confirmed receipt + allocation A80
S-->>A: เหลือ A20+B10; Bob ยังคง B40; supply 70
Note over S,P: redeem failure revert ทั้งรายการ; reward ภายนอก reconcile แยก
```

ผู้ส่งระบุ allocations โดยไม่มี from ใน payload. Contract ใช้ msg.sender เป็นเจ้าของยอด. ข้อมูลจาก UI หรือ indexer ไม่ใช่สิทธิ์โอนแทนผู้อื่น. ทุกล็อตในรายการต้อง Active แม้ผู้ส่งมียอดใช้ได้รวมพอในล็อตอื่น. ทุก failure revert ทั้งรายการ. การโอนไม่ลด supply และไม่ reset startDate / expireDate.

#### ตรวจยอดและหมดอายุแยกล็อต

```mermaid
sequenceDiagram
autonumber
actor U as Member / App
participant R as Chain RPC
participant P as Proposed Point program
Note over U,P: หลังโอน B40 และใช้ A80: Alice A20+B10 / Bob B40
U->>R: 1 พ.ย. อ่าน availableBalanceOf และ ledger ของทั้งคู่
R->>P: eth_call ณ block ที่อ่าน
P->>P: A หมดแล้ว; B ยัง Active
P-->>R: Available Alice 10 / Bob 40; ledger Alice 30 / Bob 40; supply 70
R-->>U: แสดง Alice expired A20; Bob B40 หมด 31 ธ.ค.
U->>U: รวม available ของสองบัญชีในตัวอย่างได้ 50
Note over U,P: ผลรวมใน App ไม่ใช่ global availableSupply method บน chain
U->>P: Alice ลอง transferLots ด้วย A1 ที่หมดอายุ
P-->>U: revert ทั้งรายการ ไม่เลือก B แทน
U->>R: 1 ม.ค. 2027 อ่านยอดอีกครั้ง
R->>P: availableBalanceOf และ ledger
P-->>R: Available ทั้งคู่ 0; ledger Alice 30 / Bob 40; supply 70
R-->>U: แสดงยอดใช้ได้ 0 พร้อมประวัติล็อต
```

หากต้องการให้ผู้ใช้เลือกล็อตตอน redeem ด้วย ต้องเป็น journey และ API อีกชุดที่ธุรกิจอนุญาตชัดเจน. C รอบนี้เพิ่มเฉพาะการโอนตามล็อตที่เลือก. Contract, Backend, UI และ ABI ของ B/C ทั้งหมดยังเป็นข้อเสนอ. ภาพรวม C ที่แยก Marketer และ End user มีใน Miro role journey ที่ลิงก์ไว้ข้างต้น.
