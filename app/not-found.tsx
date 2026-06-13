export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">
          페이지를 찾을 수 없습니다
        </h1>
        <a href="/" className="text-blue-400 hover:underline">
          홈으로 돌아가기
        </a>
      </div>
    </main>
  );
}