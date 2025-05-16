export default function DonateSection() {
  return (
    <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#f9f9f9', padding: '10px', borderRadius: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
      <h4>후원하기</h4>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src="/btc-qr.png" alt="BTC QR" style={{ width: '100px', marginRight: '10px' }} />
        <div>
          <div>BTC: 1A2b3C4d5E6F7g8H9iJ0kLmNoPqRsTuVw</div>
          <div>USDT: 0x1234567890abcdef1234567890abcdef12345678</div>
        </div>
      </div>
    </div>
  );
}