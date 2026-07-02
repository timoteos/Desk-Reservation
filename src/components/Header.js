export default function Header() {
  return (
    <header className="bg-white border-t-4 border-blue-400 px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
      {/* Logos — replace src with actual image paths */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <img src="/logos/dhs.png" alt="DHS Seal" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
        <img src="/logos/soh.png" alt="State of Hawaii Seal" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
        <img src="/logos/mqd.png" alt="MQD Logo" className="w-10 h-10 md:w-14 md:h-14 object-contain" onError={(e) => { e.target.style.display='none'; }} />
      </div>
      <h1 className="text-lg md:text-3xl font-extrabold text-mqd-title leading-tight">
        MQD Desk Reservation Systems Office
      </h1>
    </header>
  );
}
