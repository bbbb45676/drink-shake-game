// 所有可以調整的數字都在這裡。試玩後要改手感、分數，只改這個檔。

export const CONFIG = {
  shop: { name: '晃晃茶舖', nameEn: 'HUANG HUANG TEA' },

  shift: {
    seconds: 300,          // 一班 5 分鐘
    maxCustomers: 16,      // 最多來幾位
    spawnGap: [12, 22],    // 下一位客人隔幾秒來（最少、最多）
    rudeChance: 0.22,      // 奧客機率
    pickyChance: 0.25,     // 刁難客機率
    firstEasy: 2,          // 前幾位一定是一般客（讓新手熟悉）
  },

  patience: { normal: 120, picky: 140, rude: 45 }, // 客人在窗口等幾秒會走

  // 計分（README 有同一張表）
  score: {
    serve: 100,            // 出餐，全部做對
    perError: -25,         // 每錯一項（茶、甜度、冰塊、加料、份量、沒搖勻）
    unsealed: -40,         // 沒封膜就交出去
    fast: [[45, 50], [75, 25]], // 客人到窗口後幾秒內交到：加幾分
    pickyBonus: 100,       // 刁難客的要求做到
    repelRude: 150,        // 砸中奧客
    hitGood: -150,         // 砸中好客人（一星負評）
    servedRude: -50,       // 乖乖做給奧客（被凹走一杯）
    walkout: -50,          // 好客人等太久走掉
    dropCup: -20,          // 杯子掉到地上
    wastePerCup: -20,      // 灑出來的飲料，每灑掉「一整杯的量」扣這麼多
    changeOk: 20,          // 找錢找對
    changeShort: -40,      // 少找（客人會罵）
    noChange: -50,         // 客人等不到找錢就走了
    remake: -15,           // 做錯被退回來重做（那杯算浪費）
  },

  // 錢（新台幣）：台灣一般手搖店的價位。只拿來算「這一班老闆賺還是虧」，不影響分數。
  money: {
    price: { black: 35, green: 35, milk: 50 }, // 中杯售價
    topping: 10,           // 加料 +10
    cup: 3,                // 杯子＋封膜
    tea: { black: 6, green: 6, milk: 12, oolong: 7 }, // 茶的成本：倒滿一整杯的量
    liquidCost: { freshMilk: 0.07, creamer: 0.05, brown: 0.06, passion: 0.12, lemon: 0.1, grapefruit: 0.12, orange: 0.1 }, // 配料吧：每 1cc
    syrup: 0.025,          // 果糖：每 1cc
    toppingPiece: 0.25,    // 料：每一顆（一勺約 14 顆＝3.5 元）
    ice: 0.3,              // 冰塊：每一顆
    dryCleaning: 150,      // 飲料砸到好客人：賠洗衣費
    wage: 196,             // 你的時薪（這一班算一小時，2026 年基本工資）
    rent: 150,             // 店租、水電分攤（每一小時）
  },
  // 做錯的飲料：客人收不收（收了照扣分；不收就退回來重做，重做一次還錯就生氣走掉）
  remake: {
    accept: { normal: 0.55, picky: 0.12 }, // 錯一項時收下的機率
    perExtraError: 0.2,    // 每多錯一項，機率少這麼多
    severe: ['沒有茶', '茶錯了', '沒封膜'], // 這幾種幾乎不收
    severeAccept: 0.08,
    maxRemakes: 1,         // 最多退幾次，再錯就走
    patienceAfter: 0.7,    // 退回重做時，耐心至少回到幾成
  },
  // 收銀：客人點完單把錢放在找零盤；拿起來放進收銀機，再從抽屜拿零錢放回找零盤
  cash: {
    exact: 0.22,           // 剛好付的機率
    big500: 0.12,          // 拿 500 元鈔的機率
    big1000: 0.05,         // 拿 1000 元鈔的機率
  },

  titles: [
    { min: 900, name: '店長候選', line: '老闆說明天開始你來排班' },
    { min: 500, name: '可以上工', line: '手腳很快，奧客也趕得很漂亮' },
    { min: 150, name: '試用期', line: '再練一下，茶要對準杯子' },
    { min: -Infinity, name: '被老闆請回家', line: '店裡還在拖地板⋯' },
  ],

  menu: {
    teas: [
      { id: 'black', name: '紅茶', color: '#93400f', label: '#b5451b' },
      { id: 'green', name: '綠茶', color: '#c7ae34', label: '#5f8f3a' },
      { id: 'milk', name: '奶茶', color: '#c4946a', label: '#8a5a3a' },
    ],
    // 甜度：果糖幾 cc（大杯 700cc）。業界慣例：少糖 70%、半糖 50%、微糖 30%（以全糖為準）
    // 全糖 40cc 果糖約 40g 糖，加上配料約 60g，跟實測的 700ml 全糖珍奶差不多
    sweet: [
      { v: 0, name: '無糖' },
      { v: 12, name: '微糖' },
      { v: 20, name: '半糖' },
      { v: 28, name: '少糖' },
      { v: 40, name: '全糖' },
    ],
    sweetTolerance: 4,          // 一般甜度誤差 ±4cc
    sweetExactTolerance: 0.6,   // 刁難客「甜度 3.7 分」＝14.8cc，誤差 ±0.6cc（1 分＝4cc）
    // 冰量（台灣手搖店的五種）：用冰鏟鏟冰，看杯子裡幾顆
    // 去冰＝先加冰、倒茶冰鎮，再用冰鏟把冰刮掉；完全去冰＝從頭到尾不加冰
    ice: [
      // 一顆冰約 25g；一鏟 8 顆約 200g
      { id: 'normal', name: '正常冰', min: 7, max: 8, recipe: '冰約 200g（一鏟，7–8 顆）' },
      { id: 'less', name: '少冰', min: 5, max: 6, recipe: '冰約七成（5–6 顆）' },
      { id: 'light', name: '微冰', min: 2, max: 3, recipe: '冰約三成（2–3 顆）' },
      { id: 'none', name: '去冰', min: 0, max: 0, chilled: true, recipe: '加冰冰鎮後刮掉' },
      { id: 'zero', name: '完全去冰', min: 0, max: 0, chilled: false, recipe: '完全不加冰' },
    ],
    // 加料：一勺約 60g（12 顆）
    toppings: [
      { id: 'pearl', name: '珍珠', min: 8, max: 16, color: '#3b2114', shape: 'ball' },
      { id: 'coco', name: '椰果', min: 8, max: 16, color: '#f4efe0', shape: 'cube' },
      { id: 'grass', name: '仙草', min: 8, max: 16, color: '#1d1410', shape: 'cube' },
      { id: 'pudding', name: '布丁', min: 8, max: 16, color: '#f0bf4c', shape: 'cube', hard: true }, // 困難版才有
    ],
    // 配方以雪克杯為主：茶幾 cc 倒進雪克杯（冰越少茶越多，整杯約到 8 分線）
    teaCc: 300,                 // 正常冰的茶量
    iceTeaAdd: { normal: 0, less: 50, light: 120, none: 190, zero: 190 }, // 冰少的時候茶多加
    teaTol: { low: 40, high: 50 }, // 茶量誤差：少 40cc、多 50cc 以內都算對
  },

  pour: {
    teaRate: 0.2,          // 茶桶每秒倒出「一杯的 20%」
    syrupRate: 16,         // 果糖機按住每秒出 16cc（全糖 40cc 約 2.5 秒）
    syrupVolume: 0.0014,   // 1cc 果糖佔大杯 700cc 的比例
    scoopMax: 12,          // 一勺＝12 顆（約 60g）：勺子伸進料槽就是滿滿一勺
    iceMax: 8,             // 一鏟＝8 顆（約 200g）：冰鏟插進冰桶就是滿滿一鏟
    iceDripRate: 2.5,      // 冰鏟在杯口上方：每秒掉幾顆冰進去（移開就停）
    chillSeconds: 1.0,     // 冰塊泡在茶裡幾秒算冰鎮過
    shakesToMix: 10,       // 搖幾下算搖勻（封膜後用手搖）
    machineShake: 2.0,     // 搖茶機搖幾秒
    shakerRate: 0.3,       // 雪克杯倒進杯子：每秒倒「一杯的 30%」（約 210cc），移開就停
    // 拿著移動太快會灑出來（撞到東西不會）。門檻＝每秒幾公尺：全滿 speedFull，每少 10% 多 speedPerEmpty/10
    spill: { minFrac: 0.45, speedFull: 1.0, speedPerEmpty: 3.0, rate: 0.35 },
  },

  // 所有倒得進杯子的液體（cc 換算：一杯 700cc＝1）
  liquids: {
    black: { name: '紅茶', color: '#93400f', kind: 'tea' },
    green: { name: '綠茶', color: '#c7ae34', kind: 'tea' },
    milk: { name: '奶茶', color: '#c4946a', kind: 'tea' },
    oolong: { name: '烏龍', color: '#a5641f', kind: 'tea', label: '#7a4a1a' },
    freshMilk: { name: '鮮奶', color: '#f4efe4', kind: 'dairy' },
    creamer: { name: '奶精', color: '#efe0c2', kind: 'dairy' },
    brown: { name: '黑糖', color: '#3b1c0b', kind: 'syrup' },
    passion: { name: '百香果汁', color: '#e3a11c', kind: 'juice' },
    lemon: { name: '檸檬汁', color: '#e8e07a', kind: 'juice' },
    grapefruit: { name: '葡萄柚汁', color: '#e6705c', kind: 'juice' },
    orange: { name: '柳橙汁', color: '#f2922a', kind: 'juice' },
  },

  // 困難版：一般版拿到 unlockScore 分就解鎖。配方參考大中和「基礎茶飲食譜」（大杯 700cc），價格參考 50嵐、清心
  hard: {
    unlockScore: 500,
    urns: ['black', 'green', 'oolong'],
    // 配料吧：按住壓頭就一直出（每秒幾 cc）
    pumps: [
      { id: 'freshMilk', rate: 60 },
      { id: 'creamer', rate: 20 },
      { id: 'brown', rate: 15 },
      { id: 'passion', rate: 12 },
      { id: 'lemon', rate: 12 },
      { id: 'grapefruit', rate: 12 },
      { id: 'orange', rate: 12 },
    ],
    // base：照正常冰的量（cc）。第一項是主體：至少要這麼多（冰少就多加，補到 8 分線）；其他項要接近配方
    // sugarFull：全糖的果糖 cc（少糖 70%、半糖 50%、微糖 30%）；fixed：甜度固定不能調
    drinks: [
      { id: 'pearlMilkTea', name: '珍珠奶茶', price: 55, base: { black: 250, creamer: 40 }, sugarFull: 40, top: 'pearl' },
      { id: 'jasmineMilkGreen', name: '茉香奶綠', price: 55, base: { green: 250, creamer: 40 }, sugarFull: 40 },
      { id: 'puddingMilkTea', name: '布丁奶茶', price: 65, base: { black: 150, creamer: 30 }, sugarFull: 20, top: 'pudding' },
      { id: 'blackLatte', name: '紅茶拿鐵', price: 65, base: { black: 200, freshMilk: 150 }, sugarFull: 40 },
      { id: 'oolongLatte', name: '烏龍拿鐵', price: 65, base: { oolong: 200, freshMilk: 150 }, sugarFull: 40 },
      { id: 'brownPearlMilk', name: '黑糖珍珠鮮奶', price: 75, base: { freshMilk: 280, brown: 30 }, sugarFull: 0, fixed: true, top: 'pearl' },
      { id: 'passionGreen', name: '百香綠茶', price: 60, base: { green: 250, passion: 25 }, sugarFull: 50 },
      { id: 'lemonBlack', name: '檸檬紅茶', price: 60, base: { black: 250, lemon: 20 }, sugarFull: 50 },
      { id: 'lemonGreen', name: '檸檬綠茶', price: 55, base: { green: 250, lemon: 20 }, sugarFull: 45 },
      { id: 'grapefruitGreen', name: '葡萄柚綠茶', price: 65, base: { green: 250, grapefruit: 25 }, sugarFull: 40 },
      { id: 'orangeBlack', name: '香橙紅茶', price: 55, base: { black: 250, orange: 20 }, sugarFull: 40 },
    ],
    sweetPct: [0, 0.3, 0.5, 0.7, 1], // 無糖、微糖、半糖、少糖、全糖
    tol: { main: 40, dairy: 25, small: 6, sugar: 4 }, // 誤差（cc）
    toppingPrice: { pearl: 10, coco: 10, grass: 10, pudding: 15 },
    extraTopChance: 0.35, // 另外加料的機率
    patienceBonus: 25,    // 困難版客人多等幾秒
  },

  throw: {
    hitSpeed: 2.2,         // 杯子速度超過（公尺／秒）撞到人＝砸
    handOverSpeed: 1.6,    // 低於這個速度靠近客人的手＝交給他
    boost: 1.5,            // 放手時把手的速度放大幾倍
    aimAssistDeg: 28,      // 往客人方向甩，幾度內自動修正瞄準
  },

  quality: [
    { name: 'low', pixelRatio: 1, shadow: 1024, bloom: false, particles: 220, softShadow: false },
    { name: 'mid', pixelRatio: 1.5, shadow: 1024, bloom: true, particles: 420, softShadow: false },
    { name: 'high', pixelRatio: 2, shadow: 2048, bloom: true, particles: 700, softShadow: true },
  ],
};

// 場景擺設（公尺）。玩家站在 z=+0.4 往 -z 看；櫃台台面高 0.9。
export const L = {
  counterY: 0.9,
  counter: { x0: -1.3, x1: 1.3, z0: -0.82, z1: -0.02 },
  ledge: { y: 1.03, x0: -0.95, x1: 0.95, z0: -1.04, z1: -0.82 },
  windowZ: -1.04,
  // 後排（靠窗）：左邊茶桶、果糖；中間收銀機（往窗口沒有東西擋）；右邊搖茶機＋封膜機，最右邊配料吧（困難版）
  // 前排：左邊沖杯器、雪克杯、冰桶；中間空著當工作檯；右邊料槽、杯架
  urns: [
    { tea: 'black', x: -1.1 },
    { tea: 'green', x: -0.875 },
    { tea: 'milk', x: -0.65 },
  ],
  urnZ: -0.64,
  urnStand: 0.2,
  syrup: { x: -0.4, z: -0.66 },
  register: { x: 0, z: -0.6 },
  changeTray: { x: -0.21, z: -0.93 },
  shakeMachine: { x: 0.44, z: -0.62 },
  sealer: { x: 0.72, z: -0.62 },
  pumpBar: { x0: 0.9, z: -0.645, gap: 0.06 },
  rinser: { x: -1.07, z: -0.17 },
  shakerHomes: [{ x: -0.89, z: -0.21 }, { x: -0.75, z: -0.21 }],
  lidHomes: [{ x: -0.89, z: -0.075 }, { x: -0.75, z: -0.075 }], // 雪克杯蓋放在雪克杯前面
  iceBin: { x: -0.47, z: -0.2, w: 0.38, d: 0.2 },
  wells: [
    { top: 'pearl', x: 0.37 },
    { top: 'coco', x: 0.53 },
    { top: 'grass', x: 0.69 },
    { top: 'pudding', x: 0.85, hard: true },
  ],
  wellZ: -0.155, wellW: 0.15, wellD: 0.19, wellDepth: 0.1,
  wellX0: 0.295, wellX1: 0.925,
  cupStack: { x: 0.2, z: -0.13, n: 5 }, // 矮一點，才不會擋到後面的搖茶機
  rag: { x: 1.08, z: -0.16 },
  serveSpot: { x: 0, z: -1.42 },
  queue: [
    { x: -1.25, z: -2.55 },
    { x: 1.05, z: -2.95 },
    { x: -0.25, z: -3.45 },
  ],
};

export const CUP = { h: 0.15, rTop: 0.046, rBot: 0.035 };

export const PALETTE = {
  cream: '#F4E8D4',
  paper: '#FFFBF3',
  brown: '#3E2618',
  teal: '#2C7A73',
  orange: '#E9713B',
  red: '#D4423A',
};

export const FONT = "'Huninn', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
