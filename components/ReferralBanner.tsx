export default function ReferralBanner() {
  return (
    <div style={{ margin: '20px 0', textAlign: 'center' }}>
      <a href="https://www.binance.com/en/futures/ref/yourreferral" target="_blank" rel="noopener noreferrer">
        <img src="/binance-banner.png" alt="Binance Referral" style={{ width: '200px' }} />
      </a>
      <a href="https://www.bybit.com/en-US/invite?ref=yourreferral" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '20px' }}>
        <img src="/bybit-banner.png" alt="Bybit Referral" style={{ width: '200px' }} />
      </a>
    </div>
  );
}