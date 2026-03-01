export default function Footer() {
  return (
    <footer className="border-t border-gray-200 mt-16">
      <div className="mx-auto max-w-3xl px-4 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} My Blog
      </div>
    </footer>
  );
}
