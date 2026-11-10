// 客人離開後留的評論（像地圖 App 上的店家評論）。全部是虛構的人名與內容。
// makeReview(ctx) → { name, badge, stars, text, color, initial }
// ctx.outcome：perfect 全對／accepted 錯了但收下／remakeFail 重做還錯／walkout 等太久／
//              hitGood 被潑到的好客人／rudeHit 被砸的奧客／rudeServed 凹到一杯的奧客／rudeLeft 奧客自己走掉

const pick = (a) => a[(Math.random() * a.length) | 0];
const chance = (p) => Math.random() < p;

const NAMES = [
  '陳小姐', '阿凱', '林家豪', 'Momo', '路過的上班族', '愛喝半糖的貓', '王大明', 'Jessica Lin', '小籠包', '珍奶警察',
  '微糖人生', '黃阿伯', '張先生', '台南吳彥祖（自稱）', '每天一杯的工程師', '騎樓遛狗人', '剛下課的高中生', 'Kevin Chen', '李媽媽', '夜班護理師',
  '外送員阿明', '減肥中（第 37 天）', '蔡小妹', 'Ricky', '退休的國文老師', '珍珠收藏家', '不加冰會死星人', 'Annie', '對面麵店老闆', '隔壁補習班老師',
  '想喝又怕胖', '吳小姐', '社畜一號', 'Jason', '鄭阿姨', '騎機車的大叔', '大學生小周', '只喝無糖的人', '貓奴小美', '路人甲',
];
const COLORS = ['#e57373', '#f06292', '#ba68c8', '#7986cb', '#4fc3f7', '#4db6ac', '#81c784', '#ffb74d', '#a1887f', '#90a4ae'];

const T = {
  perfect: [
    '{drink}完全照我說的做，店員比我還了解我自己。',
    '店員只有兩隻手，效率卻比我們公司整個部門還高。',
    '甜度抓得超準，懷疑店員舌頭有裝游標卡尺。',
    '冰塊剛剛好，我的強迫症當場痊癒。',
    '封膜封得比我嘴巴還緊，一路晃回家都沒漏。',
    '喝完人生突然有了方向（往下一家飲料店）。',
    '櫃台裡只看得到兩隻手飄來飄去，有點靈異，但飲料五星。',
    '搖茶機的聲音很療癒，聽完我的焦慮也被搖勻了。',
    '半糖就是半糖，不是店員心情不好的全糖，感謝。',
    '老闆，請幫那兩隻手加薪。',
    '拿到飲料那一刻，我原諒了今天所有的會議。',
    '這杯{drink}像初戀，甜得剛剛好。（後來也沒了）',
    '比例完美，建議申請國家級非物質文化遺產。',
    '店員倒茶的手比外科醫生還穩，我要推薦給我們醫院。',
    '喝一口就決定把這家設成我的「家」。',
  ],
  perfectTop: {
    pearl: ['珍珠 Q 到可以去參加彈力球國手選拔。', '珍珠彈到我差點從吸管被射回去。'],
    coco: ['椰果脆到我以為在吃水晶。', '椰果多到每一口都有，很有安全感。'],
    grass: ['仙草滑到差點從吸管逃走。', '仙草黑得很有深度，跟我的黑眼圈一樣。'],
    pudding: ['布丁完整到我捨不得戳破。', '布丁抖得比我上台報告還厲害，好吃。'],
  },
  fast: ['出杯快到我錢包還沒收好。', '點完單轉身滑個手機，飲料就到了，這是魔法吧。', '速度快到我以為是預先做好的，結果是現搖的。'],
  picky: ['我故意出難題，結果被完美接住，我輸了，五星。', '說要剛好幾顆就真的剛好幾顆，這家店有神。', '我的奇怪要求店員連眉頭都沒皺（因為他沒有臉）。'],
  hard: ['奶精跟鮮奶分得清清楚楚，這是有在讀書的店。', '配方抓得跟食譜一樣準，老闆是不是偷偷去上過課。'],
  remadeOk: ['第一杯做錯，第二杯神救援，知錯能改善莫大焉。', '退一次就對了，店員抗壓性很強，給四星鼓勵。', '重做的那杯比我的人生還認真。'],
  accepted: [
    '我點{drink}，拿到的是平行宇宙的版本，但還能喝。',
    '店員態度很好，只是手跟腦好像沒有接上藍牙。',
    '喝起來像老闆在測試新口味，但我沒有報名當白老鼠。',
    '三星給那兩隻很努力的手，剩下兩星等練好再來拿。',
    '味道有點神秘，喝完我開始思考人生。',
    '不是我點的，但我是成熟的大人，我喝了。',
    '算了，人生本來就不完美，飲料也是。',
  ],
  err: [
    ['太甜', '甜到我的牙齒自己去預約了牙醫。'],
    ['不夠甜', '說好的甜度呢？喝起來跟我的薪水一樣淡。'],
    ['冰塊太多', '冰塊多到可以開溜冰場。'],
    ['冰塊太少', '冰塊少到要拿放大鏡找。'],
    ['冰沒刮乾淨', '說好去冰還有冰，這冰是有多愛我。'],
    ['去冰沒冰鎮', '去冰是去冰，但不是溫的啊。'],
    ['沒搖勻', '上半杯是水、下半杯是糖，一杯體驗兩種人生。'],
    ['茶太少', '這杯是空氣口味嗎，一半都是冰。'],
    ['茶太多', '茶多到滿出來，店員對我的愛也是。'],
    ['茶錯了', '點的茶跟拿到的茶不一樣，交通號誌都沒你會變。'],
    ['沒加', '我的料呢？可能還在料槽裡排隊。'],
    ['太少', '料少到我以為是裝飾品。'],
    ['太多', '料多到吸管插不下去，算是另一種幸福。'],
    ['多加了', '多送我沒點的料，雖然奇怪，但我收下了。'],
    ['沒封膜', '沒封膜就給我，一路灑回家，螞蟻謝謝你。'],
    ['不是', '我要的數字跟你的數字，中間隔了一個銀河。'],
  ],
  walkout: [
    '等到我手機沒電，人生也沒電。',
    '排隊的時間夠我讀完一本小說的序。',
    '看兩隻手在空中忙半天，沒有一杯是我的。',
    '等到我都長出白頭髮了。',
    '店員很認真，認真到忘記我的存在。',
    '我跟收銀機對望了兩分鐘，最後我選擇離開。',
  ],
  remakeFail: ['退了一次還是錯，我決定去隔壁買。', '同一杯錯兩次，這是某種行為藝術嗎。', '給你兩次機會，你給我兩杯驚喜（驚嚇）。'],
  hitGood: [
    '我只是來買飲料，結果飲料把我的白 T 買走了。',
    '被潑了一身{drink}，現在全身都是糖的味道，螞蟻很愛我。',
    '店員投球很準，建議去打職棒，不要對客人投。',
    '洗衣費有賠，但我的尊嚴沒有退款。',
    '我是來喝飲料的，不是來被飲料喝的。',
  ],
  rudeHit: [
    '我只是說要打八折，就被飲料轟出騎樓，我要找議員！！',
    '這家店店員會飛杯子，大家小心（被飛的是我）。',
    '我是 VIP 你知道嗎？原來 VIP 也會飛。',
    '想插隊被請出去，服務態度極差（我很好，是他們的問題）。',
    '我只是要求免費續杯，回應我的是物理學。',
    '被雪克杯打中，現在腦袋裡還在搖。',
  ],
  rudeServed: ['店員超好凹，說要免費就免費，下次帶朋友一起來。', '五星！老闆一定不知道今天被我賺一杯。', '這家店很懂得尊重 VIP（就是我）。'],
  rudeLeft: ['不給我插隊也不給我打折，哼，兩星。', '老闆不在，店員不懂變通。', '等那麼久也不先做我的，我可是常客（第一次來）。'],
  change: {
    ok: ['找錢一塊不差，現在這種誠實不多了。', '零錢找得比 ATM 還準。'],
    short: ['而且少找我 {n} 塊，我記住了，我會回來的。', '少找 {n} 塊，這杯默默漲價了。'],
    over: ['多找我 {n} 塊，五星！老闆不要看這則。', '還多找我 {n} 塊，佛心店家。'],
    none: ['錢給了，零錢跟我的青春一起留在店裡。', '找零呢？我等到懷疑這家店不收零錢。'],
  },
};

const STARS = { perfect: 5, accepted: 3, remakeFail: 1, walkout: 1, hitGood: 1, rudeHit: 1, rudeServed: 5, rudeLeft: 2 };

export function makeReview(ctx) {
  const o = ctx.outcome || 'walkout';
  let stars = STARS[o] ?? 3;
  const parts = [];
  if (o === 'perfect') {
    if (ctx.remade) { stars = 4; parts.push(pick(T.remadeOk)); }
    else if (ctx.picky) parts.push(pick(T.picky));
    else {
      const top = (ctx.tops || []).find((t) => T.perfectTop[t]);
      parts.push(top && chance(0.5) ? pick(T.perfectTop[top]) : pick(T.perfect));
    }
    if (ctx.fast && !ctx.remade && chance(0.6)) parts.push(pick(T.fast));
    else if (ctx.slow && !ctx.remade) { stars = Math.min(stars, 4); parts.push('就是等有點久。'); }
    if (ctx.hard && chance(0.35)) parts.push(pick(T.hard));
  } else if (o === 'accepted') {
    const n = (ctx.errs || []).length;
    stars = n <= 1 ? 3 : 2;
    const e = (ctx.errs || [])[0] || '';
    const hit = T.err.find(([k]) => e.startsWith(k) || e.includes(k));
    parts.push(hit && chance(0.75) ? hit[1] : pick(T.accepted));
    if (ctx.remade) parts.push('還是退過一次才變這樣的。');
  } else if (o === 'walkout') stars = chance(0.3) ? 2 : 1, parts.push(pick(T.walkout));
  else parts.push(pick(T[o] || T.walkout));
  // 找錢
  const ch = ctx.change;
  if (ch === 'short') { stars -= 1; parts.push(pick(T.change.short)); }
  else if (ch === 'over') { stars += 1; parts.push(pick(T.change.over)); }
  else if (ch === 'none') { stars -= 1; parts.push(pick(T.change.none)); }
  else if (ch === 'ok' && o === 'perfect' && chance(0.25)) parts.push(pick(T.change.ok));
  stars = Math.max(1, Math.min(5, stars));
  const text = parts.join('').replaceAll('{drink}', ctx.drink || '飲料').replaceAll('{n}', ctx.changeDiff ?? '');
  const name = ctx.kind === 'rude' && chance(0.5) ? pick(['VIP 本人', '我認識你們老闆', '要求打折的那位', '常客（自稱）']) : pick(NAMES);
  const reviews = 1 + ((Math.random() * (chance(0.3) ? 400 : 40)) | 0);
  const badge = chance(0.45) ? `在地嚮導・${reviews} 則評論${chance(0.5) ? `・${(reviews * 2.3) | 0} 張相片` : ''}` : `${reviews} 則評論`;
  return { name, badge, stars, text, color: pick(COLORS), initial: [...name][0] };
}

export function starText(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
