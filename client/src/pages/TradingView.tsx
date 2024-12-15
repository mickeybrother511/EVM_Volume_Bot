import { useState, useEffect } from 'react';
import axios from 'axios';

const TradingView = () => {
  const [walletCounts, setWalletCounts] = useState<number | ''>(
    localStorage.getItem('walletCounts')
      ? Number(localStorage.getItem('walletCounts'))
      : '',
  ); // Initialize from localStorage
  const [AvaxFundAmount, setAvaxFundAmount] = useState<string | ''>(
    localStorage.getItem('AvaxFundAmount') || '',
  ); // Initialize from localStorage
  const [maxGas, setMaxGas] = useState<string | ''>(
    localStorage.getItem('maxGas') || '',
  ); // Initialize from localStorage
  const [tradingMintAmount, setTradingMintAmount] = useState<string | ''>(
    localStorage.getItem('tradingMintAmount') || '',
  ); // Initialize from localStorage
  const [tradingMaxAmount, setTradingMaxAmount] = useState<string | ''>(
    localStorage.getItem('tradingMaxAmount') || '',
  ); // Initialize from localStorage
  const [tradingMinInterval, setTradingMinInterval] = useState<string | ''>(
    localStorage.getItem('tradingMinInterval') || '',
  ); // Initialize from localStorage
  const [tradingMaxInterval, setTradingMaxInterval] = useState<string | ''>(
    localStorage.getItem('tradingMaxInterval') || '',
  ); // Initialize from localStorage
  const [isTrading, setIsTrading] = useState<boolean>(() => {
    const savedTradingStatus = localStorage.getItem('isTrading');
    return savedTradingStatus === 'true'; // Parse the string to boolean
  }); // Initialize from localStorage

  useEffect(() => {
    // Save each state to localStorage when it changes
    localStorage.setItem('walletCounts', JSON.stringify(walletCounts));
    localStorage.setItem('AvaxFundAmount', AvaxFundAmount);
    localStorage.setItem('maxGas', maxGas);
    localStorage.setItem('tradingMintAmount', tradingMintAmount);
    localStorage.setItem('tradingMaxAmount', tradingMaxAmount);
    localStorage.setItem('tradingMinInterval', tradingMinInterval);
    localStorage.setItem('tradingMaxInterval', tradingMaxInterval);
    localStorage.setItem('isTrading', JSON.stringify(isTrading));
  }, [
    walletCounts,
    AvaxFundAmount,
    maxGas,
    tradingMintAmount,
    tradingMaxAmount,
    tradingMinInterval,
    tradingMaxInterval,
    isTrading,
  ]);

  useEffect(() => {
    const getStatus = async () => {
      const result = await axios.get('http://localhost:5000/api/is_running');
      setIsTrading(result.data.message);
      console.log(result.data.message);
    };
    getStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isTrading) {
      alert(
        'Now, the Bot is trading. If you want new trading, please stop it first.',
      );
      return; // Prevent further execution if already trading
    }

    try {
      const result = await axios.post('http://localhost:5000/api/start', {
        walletCounts,
        AvaxFundAmount,
        maxGas,
        tradingMintAmount,
        tradingMaxAmount,
        tradingMinInterval,
        tradingMaxInterval,
      });
      console.log(result.data);
      alert('Bot started trading');
      setIsTrading(true); // Update trading status
    } catch (err) {
      console.log(err);
      alert('An error occurred. Please try again later.');
    }
  };

  const stopTrading = async () => {
    try {
      const result = await axios.post('http://localhost:5000/api/stop');
      console.log(result.data); // Handle the response as needed
      alert('Trading stopped');
      setIsTrading(false); // Update trading status
    } catch (err) {
      console.log(err);
      alert('An error occurred. Please try again later.');
    }
  };

  return (
    <div className='flex w-full flex-col items-center'>
      <iframe
        className='h-[700px] w-full'
        src='https://dexscreener.com/avalanche/0x6D4bdefe5b4644AfF3617ed7CE2b7599E56fA135?embed=1'
        title='Trading View'
      ></iframe>

      <div className='mt-10 w-full max-w-6xl px-4'>
        <form onSubmit={handleSubmit}>
          <div className='grid grid-cols-2 gap-4'>
            {/* First row: Wallet Address, Wallet Counts, Fund Amount */}
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Wallet Counts:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='number' // Integer type input
                value={walletCounts}
                onChange={(e) => setWalletCounts(Number(e.target.value) || '')}
                required
              />
            </div>
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Max Gas:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={maxGas}
                onChange={(e) => setMaxGas(e.target.value)}
                required
              />
            </div>

            {/* Second row: Min Amount, Max Amount, Max Gas */}
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Min Amount:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={tradingMintAmount}
                onChange={(e) => setTradingMintAmount(e.target.value)}
                required
              />
            </div>
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Max Amount:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={tradingMaxAmount}
                onChange={(e) => setTradingMaxAmount(e.target.value)}
                required
              />
            </div>

            {/* Third row: Min Interval and Max Interval */}
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Min Interval:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={tradingMinInterval}
                onChange={(e) => setTradingMinInterval(e.target.value)}
                required
              />
            </div>
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Max Interval:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={tradingMaxInterval}
                onChange={(e) => setTradingMaxInterval(e.target.value)}
                required
              />
            </div>
            <div className='flex items-center gap-1'>
              <label className='flex-shrink-0'>
                <strong>Fund Amount:</strong>
              </label>
              <input
                className='form-control w-full rounded-md bg-slate-200'
                type='text' // Change to text input
                value={AvaxFundAmount}
                onChange={(e) => setAvaxFundAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className='mt-4 flex gap-4'>
            <button
              type='submit'
              className='btn btn-success w-full rounded-md bg-green-700 p-2 disabled:opacity-65'
              disabled={isTrading} // Disable when trading
            >
              Start
            </button>
            <button
              type='button'
              onClick={stopTrading}
              className='btn btn-danger w-full rounded-md bg-red-600 p-2 disabled:opacity-65'
              disabled={!isTrading} // Disable when not trading
            >
              Stop
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TradingView;
