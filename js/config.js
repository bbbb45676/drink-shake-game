// 所有可以調整的數字都在這裡。試玩後要改手感、分數，只改這個檔。

export const CONFIG = {
  shop: { name: '晃晃茶舖', nameEn: 'HUANG HUANG TEA' },

  shift: {
    seconds: 180,          // 一班 3 分鐘
    maxCustomers: 14,      // 最多來幾位
    rudeChance: 0.22,      // 奧客機率
    pickyChance: 0.25,     // 刁難客機率
    firstEasy: 2,          // 前幾位一定是一般客（讓新手熟悉）
  },

  patience: { normal: 70, picky: 80, rude: 30 }, // 客人在窗口等幾秒會走

  // 計分（README 有同一張表）
  score: {
    serve: 100,            // 出餐，全部做對
    perError: -25,         // 每錯一項（茶、甜度、冰塊、加料、份量、沒搖勻）
    unsealed: -40,         // 沒封膜就交出去
    fast: [[20, 50], [35, 25]], // 客人到窗口後幾秒內交到：加幾分
    pickyBonus: 100,       // 刁難客的要求做到
    repelRude: 150,        // 砸中奧客
    hitGood: -150,         // 砸中好客人（一星負評）
    servedRude: -50,       // 乖乖做給奧客（被凹走一杯）
    walkout: -50,          // 好客人等太久走掉
    dropCup: -20,          // 杯子掉到地上
    wastePerCup: -20,      // 灑出來的飲料，每灑掉「一整杯的量」扣這麼多
  },

  // 錢（新台幣）：台灣一般手搖店的價位。只拿來算「這一班老闆賺還是虧」，不影響分數。
  money: {
    price: { black: 35, green: 35, milk: 50 }, // 中杯售價
    topping: 10,           // 加料 +10
    cup: 3,                // 杯子＋封膜
    tea: { black: 6, green: 6, milk: 12 }, // 茶的成本：倒滿一整杯的量
    syrup: 0.1,            // 果糖：每 1 甜度
    toppingPiece: 0.25,    // 料：每一顆（一勺約 14 顆＝3.5 元）
    ice: 0.3,              // 冰塊：每一顆
    dryCleaning: 150,      // 飲料砸到好客人：賠洗衣費
    wage: 196,             // 你的時薪（這一班算一小時，2026 年基本工資）
    rent: 150,             // 店租、水電分攤（每一小時）
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
    // 甜度：按住果糖機的時間決定（每秒 +4）
    sweet: [
      { v: 0, name: '無糖' },
      { v: 3, name: '微糖' },
      { v: 5, name: '半糖' },
      { v: 7, name: '少糖' },
      { v: 10, name: '全糖' },
    ],
    sweetTolerance: 1.0,
    sweetExactTolerance: 0.15,
    // 冰塊顆數
    ice: [
      { id: 'none', name: '去冰', min: 0, max: 0 },
      { id: 'less', name: '少冰', min: 1, max: 2 },
      { id: 'normal', name: '正常冰', min: 3, max: 5 },
    ],
    // 加料：一份的顆數範圍
    toppings: [
      { id: 'pearl', name: '珍珠', min: 6, max: 22, color: '#3b2114', shape: 'ball' },
      { id: 'coco', name: '椰果', min: 6, max: 22, color: '#f4efe0', shape: 'cube' },
      { id: 'grass', name: '仙草', min: 6, max: 22, color: '#1d1410', shape: 'cube' },
    ],
    fillMin: 0.75,         // 至少要裝到 75%
  },

  pour: {
    teaRate: 0.2,          // 茶桶每秒倒出「一杯的 20%」
    syrupRate: 4,          // 果糖每秒 +4 甜度
    syrupVolume: 0.006,    // 每 1 甜度佔杯子多少容量（全糖＝6%）
    scoopPerMeter: 140,    // 勺子在料槽裡移動 1 公尺舀起幾顆
    scoopMax: 14,          // 一勺最多幾顆
    scoopPourRate: 26,     // 倒料速度（顆／秒）
    shakesToMix: 10,       // 搖幾下算搖勻
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
  urns: [
    { tea: 'black', x: -0.94 },
    { tea: 'green', x: -0.68 },
    { tea: 'milk', x: -0.42 },
  ],
  urnZ: -0.64,
  urnStand: 0.2,
  cupStack: { x: -0.17, z: -0.64 },
  syrup: { x: 0.12, z: -0.66 },
  wells: [
    { top: 'pearl', x: 0.43 },
    { top: 'coco', x: 0.6 },
    { top: 'grass', x: 0.77 },
  ],
  wellZ: -0.34, wellW: 0.15, wellD: 0.19, wellDepth: 0.1,
  iceBin: { x: 0.6, z: -0.63, w: 0.48, d: 0.2 },
  sealer: { x: 1.05, z: -0.46 },
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
