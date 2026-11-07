'use strict';
// J-BANK unified investor leaderboard. Read-only over existing J-STOCK and
// J-COIN portfolios: no transfers, portfolio migrations, or balance writes.
// Use BigInt throughout: JUNJA G balances can exceed Number.MAX_SAFE_INTEGER.
const STOCK_PORTFOLIO_PREFIX='jstock:portfolio:';
const COIN_PORTFOLIO_PREFIX='jcoin:portfolio:';
const safeNumber=s=>BigInt(s??'0');
function portfolioProfit(portfolio,quotes,denominator){
 if(!portfolio)return 0n;
 const holdings=portfolio.holdings||{};
 let unrealized=0n;
 for(const [id,position] of Object.entries(holdings)){
  // Legacy entries may refer to delisted or not-yet-initialized symbols.
  const price=quotes.get(id);
  if(price===undefined)continue;
  const quantity=safeNumber(position.qty);
  const cost=safeNumber(position.cost);
  unrealized+=(quantity*price)/denominator-cost;
 }
 return unrealized+safeNumber(portfolio.realized);
}
function parseSaved(value){
 if(value==null)return null;
 const parsed=JSON.parse(String(value));
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('투자 계좌 데이터가 올바르지 않습니다.');
 return parsed;
}
function combinedInvestmentRanking({db,stockQuotes,coinQuotes,limit=10}){
 const stocks=new Map(stockQuotes.map(s=>[s.id,safeNumber(s.price)]));
 const coins=new Map(coinQuotes.map(s=>[s.id,safeNumber(s.price)]));
 // Include all invested users BEFORE truncating the leaderboard. Combining
 // already-truncated top-N lists produces an incorrect overall ordering.
 const rows=db.prepare(`
 SELECT u.id AS user_id,u.nickname AS nickname,st.value AS stock_account,co.value AS coin_account
 FROM users u
 LEFT JOIN game_state st ON st.key=('${STOCK_PORTFOLIO_PREFIX}' || u.id)
 LEFT JOIN game_state co ON co.key=('${COIN_PORTFOLIO_PREFIX}' || u.id)
 WHERE COALESCE(u.is_disabled,0)=0 AND (st.value IS NOT NULL OR co.value IS NOT NULL)
 `).all();
 const result=[];
 for(const row of rows){
  try{
   const stockProfit=portfolioProfit(parseSaved(row.stock_account),stocks,1n);
   const coinProfit=portfolioProfit(parseSaved(row.coin_account),coins,10000n);
   result.push({nickname:String(row.nickname),stockProfit:String(stockProfit),coinProfit:String(coinProfit),
    profit:String(stockProfit+coinProfit),userId:safeNumber(row.user_id)});
  }catch(_err){
   // One corrupt legacy account must not hide every other investor from
   // the public leaderboard. This read-only query never repairs accounts.
  }
 }
 result.sort((a,b)=>{
  const x=safeNumber(a.profit),y=safeNumber(b.profit);
  if(x!==y)return x>y?-1:1;
  return a.userId<b.userId?-1:a.userId>b.userId?1:0;
 });
 return result.slice(0,Math.max(0,Math.min(100,Number(limit)||10)))
  .map(({userId,...row})=>row);
}
module.exports={combinedInvestmentRanking,portfolioProfit};
