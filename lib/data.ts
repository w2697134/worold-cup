import type { Match, Team } from "./types";

export const TEAMS: Team[] = [
  { code: "mx", name: "墨西哥", nameEn: "Mexico", group: "A", tier: "host" },
  { code: "za", name: "南非", nameEn: "South Africa", group: "A", tier: "darkhorse" },
  { code: "kr", name: "韩国", nameEn: "Korea Republic", group: "A", tier: "contender" },
  { code: "cz", name: "捷克", nameEn: "Czechia", group: "A", tier: "darkhorse" },

  { code: "ca", name: "加拿大", nameEn: "Canada", group: "B", tier: "host" },
  { code: "ba", name: "波黑", nameEn: "Bosnia and Herzegovina", group: "B", tier: "darkhorse" },
  { code: "qa", name: "卡塔尔", nameEn: "Qatar", group: "B", tier: "darkhorse" },
  { code: "ch", name: "瑞士", nameEn: "Switzerland", group: "B", tier: "contender" },

  { code: "br", name: "巴西", nameEn: "Brazil", group: "C", tier: "favorite" },
  { code: "ma", name: "摩洛哥", nameEn: "Morocco", group: "C", tier: "contender" },
  { code: "ht", name: "海地", nameEn: "Haiti", group: "C", tier: "newcomer" },
  { code: "gb-sct", name: "苏格兰", nameEn: "Scotland", group: "C", tier: "darkhorse" },

  { code: "us", name: "美国", nameEn: "USA", group: "D", tier: "host" },
  { code: "py", name: "巴拉圭", nameEn: "Paraguay", group: "D", tier: "darkhorse" },
  { code: "au", name: "澳大利亚", nameEn: "Australia", group: "D", tier: "darkhorse" },
  { code: "tr", name: "土耳其", nameEn: "Türkiye", group: "D", tier: "contender" },

  { code: "de", name: "德国", nameEn: "Germany", group: "E", tier: "favorite" },
  { code: "cw", name: "库拉索", nameEn: "Curaçao", group: "E", tier: "newcomer" },
  { code: "ci", name: "科特迪瓦", nameEn: "Côte d'Ivoire", group: "E", tier: "darkhorse" },
  { code: "ec", name: "厄瓜多尔", nameEn: "Ecuador", group: "E", tier: "darkhorse" },

  { code: "nl", name: "荷兰", nameEn: "Netherlands", group: "F", tier: "favorite" },
  { code: "jp", name: "日本", nameEn: "Japan", group: "F", tier: "contender" },
  { code: "se", name: "瑞典", nameEn: "Sweden", group: "F", tier: "darkhorse" },
  { code: "tn", name: "突尼斯", nameEn: "Tunisia", group: "F", tier: "darkhorse" },

  { code: "be", name: "比利时", nameEn: "Belgium", group: "G", tier: "contender" },
  { code: "eg", name: "埃及", nameEn: "Egypt", group: "G", tier: "darkhorse" },
  { code: "ir", name: "伊朗", nameEn: "IR Iran", group: "G", tier: "darkhorse" },
  { code: "nz", name: "新西兰", nameEn: "New Zealand", group: "G", tier: "newcomer" },

  { code: "es", name: "西班牙", nameEn: "Spain", group: "H", tier: "favorite" },
  { code: "cv", name: "佛得角", nameEn: "Cabo Verde", group: "H", tier: "newcomer" },
  { code: "sa", name: "沙特", nameEn: "Saudi Arabia", group: "H", tier: "darkhorse" },
  { code: "uy", name: "乌拉圭", nameEn: "Uruguay", group: "H", tier: "contender" },

  { code: "fr", name: "法国", nameEn: "France", group: "I", tier: "favorite" },
  { code: "sn", name: "塞内加尔", nameEn: "Senegal", group: "I", tier: "contender" },
  { code: "iq", name: "伊拉克", nameEn: "Iraq", group: "I", tier: "newcomer" },
  { code: "no", name: "挪威", nameEn: "Norway", group: "I", tier: "contender" },

  { code: "ar", name: "阿根廷", nameEn: "Argentina", group: "J", tier: "favorite" },
  { code: "dz", name: "阿尔及利亚", nameEn: "Algeria", group: "J", tier: "darkhorse" },
  { code: "at", name: "奥地利", nameEn: "Austria", group: "J", tier: "darkhorse" },
  { code: "jo", name: "约旦", nameEn: "Jordan", group: "J", tier: "newcomer" },

  { code: "pt", name: "葡萄牙", nameEn: "Portugal", group: "K", tier: "favorite" },
  { code: "cd", name: "刚果（金）", nameEn: "Congo DR", group: "K", tier: "darkhorse" },
  { code: "uz", name: "乌兹别克斯坦", nameEn: "Uzbekistan", group: "K", tier: "newcomer" },
  { code: "co", name: "哥伦比亚", nameEn: "Colombia", group: "K", tier: "contender" },

  { code: "gb-eng", name: "英格兰", nameEn: "England", group: "L", tier: "favorite" },
  { code: "hr", name: "克罗地亚", nameEn: "Croatia", group: "L", tier: "contender" },
  { code: "gh", name: "加纳", nameEn: "Ghana", group: "L", tier: "darkhorse" },
  { code: "pa", name: "巴拿马", nameEn: "Panama", group: "L", tier: "newcomer" },
];

export const TEAM_BY_CODE: Record<string, Team> = Object.fromEntries(
  TEAMS.map((team) => [team.code, team]),
);

export const TEAM_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  TEAMS.flatMap((team) => [
    [team.nameEn, team.code],
    [team.name, team.code],
  ]),
);

export function isRealTeamCode(code: string): boolean {
  return Boolean(TEAM_BY_CODE[code]);
}

export function isPlaceholderTeamCode(code: string): boolean {
  return code === "tbd" || code.startsWith("slot-");
}

export function isMatchupKnown(match: Pick<Match, "home" | "away">): boolean {
  return isRealTeamCode(match.home) && isRealTeamCode(match.away);
}

export function isPredictableMatch(match: Pick<Match, "home" | "away" | "status">): boolean {
  return match.status === "upcoming" && isMatchupKnown(match);
}

export function getTeamName(code: string): string {
  const team = TEAM_BY_CODE[code];
  if (team) return team.name;
  return placeholderName(code);
}

export function getTeamNameEn(code: string): string {
  const team = TEAM_BY_CODE[code];
  if (team) return team.nameEn;
  return placeholderName(code);
}

function placeholderName(code: string): string {
  if (code === "tbd") return "待定";
  if (!code.startsWith("slot-")) return code;

  const raw = code.slice(5).toUpperCase();
  const rank = raw.match(/^\d+/)?.[0] ?? "";
  const groups = raw.slice(rank.length);
  if (rank === "1") return `${groups}组第1`;
  if (rank === "2") return `${groups}组第2`;
  if (rank === "3") return `${groups}组第3`;
  return raw;
}

export const STAR_PLAYERS: Record<string, { name: string; note: string }> = {
  mx: { name: "希门尼斯", note: "中锋支点和禁区终结是主要看点" },
  za: { name: "塔乌", note: "反击速度和边路推进能制造压力" },
  kr: { name: "孙兴慜", note: "反击终结和远射仍是关键威胁" },
  cz: { name: "希克", note: "禁区支点和终结能力突出" },
  ca: { name: "阿方索·戴维斯", note: "左路推进会影响转换质量" },
  ba: { name: "哲科", note: "经验和禁区处理仍有价值" },
  qa: { name: "阿菲夫", note: "前场串联和定位球是突破口" },
  ch: { name: "扎卡", note: "中场节奏和长传转移稳定" },
  br: { name: "维尼修斯", note: "左路一对一是核心威胁" },
  ma: { name: "阿什拉夫", note: "右路攻防转换质量高" },
  ht: { name: "纳宗", note: "反击中需要承担终结任务" },
  "gb-sct": { name: "麦克托米奈", note: "后插上和定位球威胁明显" },
  us: { name: "普利西奇", note: "前场推进和射门是核心看点" },
  py: { name: "阿尔米隆", note: "速度和纵向突破是主要武器" },
  au: { name: "古德温", note: "定位球和边路传中有稳定输出" },
  tr: { name: "恰尔汗奥卢", note: "远射和传球能拉开防线" },
  de: { name: "维尔茨", note: "肋部创造力是德国进攻重点" },
  cw: { name: "巴库纳", note: "中后场出球和对抗是基础盘" },
  ci: { name: "凯西", note: "中场对抗和插上得分兼具" },
  ec: { name: "凯塞多", note: "拦截覆盖和推进质量稳定" },
  nl: { name: "范戴克", note: "防线稳定和定位球威胁突出" },
  jp: { name: "久保建英", note: "小空间创造机会能力强" },
  se: { name: "伊萨克", note: "持球和终结能力兼具" },
  tn: { name: "斯希里", note: "中场覆盖和对抗强度可靠" },
  be: { name: "德布劳内", note: "传球视野和定位球质量高" },
  eg: { name: "萨拉赫", note: "右路内切和反击终结是核心威胁" },
  ir: { name: "塔雷米", note: "门前嗅觉和串联能力突出" },
  nz: { name: "克里斯·伍德", note: "高点和禁区终结是主要方案" },
  es: { name: "亚马尔", note: "边路突破和创造力是变化来源" },
  cv: { name: "贝贝", note: "远射和身体对抗能制造意外" },
  sa: { name: "多萨里", note: "大赛经验和边路冲击是看点" },
  uy: { name: "努涅斯", note: "冲击力和机会把握决定上限" },
  fr: { name: "姆巴佩", note: "速度和终结都是顶级配置" },
  sn: { name: "库利巴利", note: "防线指挥和对抗能力强" },
  iq: { name: "候赛因", note: "锋线支点和反击终结是重点" },
  no: { name: "哈兰德", note: "禁区终结效率极高" },
  ar: { name: "梅西", note: "定位球和最后一传仍是关键变量" },
  dz: { name: "马赫雷斯", note: "右路创造力和定位球质量高" },
  at: { name: "萨比策", note: "中场压迫和远射能力稳定" },
  jo: { name: "塔马里", note: "边路速度和个人突破是反击重点" },
  pt: { name: "B.费尔南德斯", note: "组织和远射是葡萄牙发牌器" },
  cd: { name: "维萨", note: "前场移动和反击效率值得关注" },
  uz: { name: "舒库罗夫", note: "中场连接和对抗影响攻守平衡" },
  co: { name: "J.罗德里格斯", note: "传球视野和定位球质量高" },
  "gb-eng": { name: "贝林厄姆", note: "中场前插和终结能力很强" },
  hr: { name: "莫德里奇", note: "节奏管理和经验仍有价值" },
  gh: { name: "库杜斯", note: "持球推进和禁区前创造力强" },
  pa: { name: "戈多伊", note: "中场覆盖和防守纪律是基础" },
};
