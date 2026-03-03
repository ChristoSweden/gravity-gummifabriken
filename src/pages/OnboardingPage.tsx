import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { setDemoInterests, seedDemoData } from '../services/mockData';

const INTEREST_OPTIONS = [
  'AI / Machine Learning',
  'Sustainability',
  'UX Design',
  'Manufacturing',
  'Fintech',
  'Health Tech',
  'EdTech',
  'E-commerce',
  'Robotics',
  'Clean Energy',
  'SaaS',
  'Marketing',
  'Supply Chain',
  'Cybersecurity',
  'IoT',
  'Gaming',
  'Real Estate Tech',
  'Food Tech',
  'Mobility',
  'Creative Arts',
];

export default function OnboardingPage() {
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (interest: string) => {
    setSelected((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleContinue = async () => {
    if (selected.length < 3) return;

    if (isDemo) {
      setSaving(true);
      setDemoInterests(selected);
      // Simulate save delay
      setTimeout(() => {
        navigate('/radar');
      }, 800);
      return;
    }

    if (!user) return;

    setSaving(true);
    setError(null);

    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || '',
      interests: selected,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    navigate('/radar');
  };

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 pt-8 pb-28">
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl border border-[--color-mist] w-full max-w-2xl mx-auto animate-fade-in">
          <h2 className="text-3xl font-brand font-bold text-[--color-primary] mb-2 text-center uppercase tracking-tight">
            What drives you?
          </h2>
          <p className="text-[--color-steel] text-center opacity-70 mb-6">
            Pick at least 3 professional interests. This is how we find your people.
          </p>

          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {INTEREST_OPTIONS.map((interest) => {
              const isSelected = selected.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all border-2 ${isSelected
                    ? 'bg-[--color-primary] text-white border-[--color-primary] shadow-md'
                    : 'bg-white text-[--color-steel] border-[--color-mist] hover:border-[--color-primary] hover:text-[--color-primary]'
                    }`}
                >
                  {interest}
                </button>
              );
            })}
          </div>

          <div className="text-center">
            <span className={`text-sm font-bold ${selected.length >= 3 ? 'text-green-600' : 'text-[--color-steel] opacity-50'}`}>
              {selected.length} selected {selected.length < 3 ? `(${3 - selected.length} more needed)` : ''}
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mt-4 rounded-r-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[--color-bg-warm] border-t border-[--color-mist]">
        <button
          onClick={handleContinue}
          disabled={selected.length < 3 || saving}
          className="w-full max-w-2xl mx-auto block bg-[--color-primary] text-white py-4 rounded-xl font-bold text-lg hover:bg-opacity-90 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Continue to Radar'}
        </button>
      </div>
    </div>
  );
}
