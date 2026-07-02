import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <>
      {/* Hero — beach photo placeholder */}
      <div
        className="relative w-full flex items-center justify-center gap-24"
        style={{ minHeight: '280px', background: '#a8b89a' }}
      >
        {/* Swap placeholder with real photo: style={{ backgroundImage: "url('/beach.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }} */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-400/60 to-stone-600/60" />

        <button
          onClick={() => navigate('/reservation')}
          className="relative z-10 bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold text-base px-10 py-6 rounded"
        >
          Make a Reservation
        </button>
        <button className="relative z-10 bg-mqd-btn hover:bg-mqd-btn-hover text-white font-semibold text-base px-10 py-6 rounded">
          Confirmation Code
        </button>
      </div>

      {/* Description */}
      <div className="flex-1 flex items-center justify-center px-8 py-10">
        <p className="text-gray-600 text-sm text-center max-w-2xl">
          A sleek MQD application that lets users quickly browse availability, reserve hotel desks,
          and manage their workspace bookings with ease.
        </p>
      </div>
    </>
  );
}
