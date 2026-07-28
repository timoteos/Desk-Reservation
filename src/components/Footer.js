import { Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-mqd-footer text-white">
      {/* Wraps rather than overflowing: three fixed-width columns don't fit a
          phone, and the seals were pushing the page sideways. */}
      <div className="flex flex-wrap items-start justify-between gap-6 px-6 md:px-8 py-6">
        {/* Contact info */}
        <div className="text-sm space-y-1.5">
          <p className="font-semibold">Contact us:</p>
          <p className="flex items-center gap-2 text-gray-300">
            <Mail className="w-4 h-4 shrink-0" />
            tsumalinog-int@dhs.hawaii.gov
          </p>
          <p className="flex items-center gap-2 text-gray-300">
            <Phone className="w-4 h-4 shrink-0" />
            1(800) 316-8005
          </p>
          <p className="flex items-start gap-2 text-gray-300">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Kakuhihewa State Office Building
              <br />
              601 Kamokila Boulevard, Room 511
              <br />
              Kapolei, HI 96707-2021
            </span>
          </p>
        </div>

        {/* FAQs box */}
        <div className="bg-mqd-faq px-6 py-4 min-w-[200px] flex-1 sm:flex-none">
          <p className="font-semibold text-sm">FAQs</p>
          <p className="text-xs text-white/70 mt-1">General frequently asked questions →</p>
        </div>

        {/* State seals */}
        <div className="flex items-center gap-3 self-center shrink-0">
          <img src={`${process.env.PUBLIC_URL}/logos/soh.png`} alt="State of Hawaii" className="w-12 h-12 md:w-16 md:h-16 object-contain opacity-80" onError={(e) => { e.target.style.display='none'; }} />
          <img src={`${process.env.PUBLIC_URL}/logos/dhs.png`} alt="DHS" className="w-12 h-12 md:w-16 md:h-16 object-contain opacity-80" onError={(e) => { e.target.style.display='none'; }} />
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
