import TradingView from './pages/TradingView';

//   {
//     path: '/',
//     element: <AppLayout />,
//     errorElement: <Error />,
//     children: [
//       {
//         path: '/sign-in',
//         element: <Signin />,
//       },
//       {
//         path: '/sign-up',
//         element: <Signup />,
//       },
//       {
//         element: <ProtectedRoute />,
//         children: [
//           {
//             path: '/',
//             element: <Home />,
//           },
//           {
//             path: '/trading-view',
//             element: <TradingView />,
//           },
//           {
//             path: '/profile',
//             element: <Profile />,
//           },

//         ]
//       }
//     ],
//   },
// ]);

function App() {
  return <TradingView />;
}

export default App;
