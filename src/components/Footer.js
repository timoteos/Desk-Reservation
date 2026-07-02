export default function Footer() {
  return (
    <footer className="bg-mqd-footer text-white">
      <div className="flex items-start justify-between px-8 py-6">
        {/* Contact info */}
        <div className="text-sm space-y-0.5">
          <p className="font-semibold">Contact us:</p>
          <p className="text-gray-300">&lt;Email&gt;</p>
          <p className="text-gray-300">&lt;Phone number&gt;</p>
          <p className="text-gray-300">Address?</p>
        </div>

        {/* FAQs box */}
        <div className="bg-mqd-faq px-6 py-4 min-w-[200px]">
          <p className="font-semibold text-sm">FAQs</p>
          <p className="text-xs text-white/70 mt-1">General frequently asked questions →</p>
        </div>

        {/* State seals */}
        <div className="flex items-center gap-3 self-center">
          <img src="/logos/soh.png" alt="State of Hawaii" className="w-16 h-16 object-contain opacity-80" onError={(e) => { e.target.style.display='none'; }} />
          <img src="/logos/dhs.png" alt="DHS" className="w-16 h-16 object-contain opacity-80" onError={(e) => { e.target.style.display='none'; }} />
        </div>
      </div>

      <div className="border-t border-white/10 py-3 px-8">
        <p className="text-xs text-gray-400 tracking-wide">
          2024 STATE OF HAWAII MED-QUEST DIVISION ALL RIGHTS RESERVED
        </p>
      </div>
    </footer>
  );
}
