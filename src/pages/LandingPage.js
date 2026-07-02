import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Search, CheckCircle2 } from 'lucide-react';

const FEATURES = [
  { icon: <Search className="w-9 h-9" />, title: 'Browse Availability', desc: 'See open desks by date and time at a glance.' },
  { icon: <Monitor className="w-9 h-9" />, title: 'Pick a Desk', desc: 'Choose the exact desk that works for you.' },
  { icon: <CheckCircle2 className="w-9 h-9" />, title: 'Get Confirmed', desc: 'Receive a confirmation code instantly.' },
];

const HEADLINE = 'Reserve Your Desk Now';

export default function LandingPage() {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const [doneTyping, setDoneTyping] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) {
        clearInterval(interval);
        setButtonsVisible(true);
        setDoneTyping(true);
      }
    }, 90);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Hero — beach photo */}
      <div
        className="relative w-full flex flex-col items-center justify-end gap-6 pb-12"
        style={{
          minHeight: '420px',
          backgroundImage: "url('/beach.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/10 to-transparent" />

        <h1 className="relative z-10 text-white text-3xl md:text-4xl font-bold drop-shadow-lg text-center px-4 min-h-[1.2em]">
          {typed}
          {!doneTyping && (
            <span className="inline-block w-[2px] h-[0.9em] bg-white ml-1 align-middle animate-pulse" />
          )}
        </h1>

        <div
          className={`relative z-10 flex flex-wrap items-center justify-center gap-4 px-4 transition-all duration-700 ease-out
            ${buttonsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
        >
          <button
            onClick={() => navigate('/reservation')}
            className="bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold text-base px-10 py-4 rounded shadow-lg transition"
          >
            Make a Reservation
          </button>
          <button
            onClick={() => navigate('/confirmation-code')}
            className="bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold text-base px-10 py-4 rounded shadow-lg transition"
          >
            Confirmation Code
          </button>
        </div>
      </div>

      {/* Feature row */}
      <div className="flex-1 flex flex-col items-center px-8 py-12 gap-10">
        <p className="text-gray-600 text-sm text-center max-w-2xl">
          A sleek MQD application that lets users quickly browse availability, reserve hotel desks,
          and manage their workspace bookings with ease.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl w-full">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="flex flex-col items-center text-center gap-2 opacity-0 animate-fade-up transition-transform duration-200 hover:-translate-y-1"
              style={{ animationDelay: `${300 + i * 150}ms` }}
            >
              <div className="text-4xl flex items-center justify-center h-10 text-mqd-title">{f.icon}</div>
              <h3 className="text-mqd-title font-semibold">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
