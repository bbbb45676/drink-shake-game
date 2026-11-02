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
    syrup: 0.025,          // 果糖：每 1cc
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
    ],
    fillMin: 0.75,         // 至少要裝到 75%
  },

  pour: {
    teaRate: 0.2,          // 茶桶每秒倒出「一杯的 20%」
    syrupRate: 16,         // 果糖機按住每秒出 16cc（全糖 40cc 約 2.5 秒）
    syrupVolume: 0.0014,   // 1cc 果糖佔大杯 700cc 的比例
    scoopMax: 12,          // 一勺＝12 顆（約 60g）：勺子伸進料槽就是滿滿一勺
    iceMax: 8,             // 一鏟＝8 顆（約 200g）：冰鏟插進冰桶就是滿滿一鏟
    iceDripRate: 2.5,      // 冰鏟在杯口上方：每秒掉幾顆冰進去（移開就停）
    chillSeconds: 1.0,     // 冰塊泡在茶裡幾秒算冰鎮過
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
