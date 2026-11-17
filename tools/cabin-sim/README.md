# cabin-sim

Physics model of the cabin pieces (measured: 1.55 g, 14 x 17.3 x 15.3 mm, walls 8.9 mm, 1.5 mm groove).

- `npm run static` – centre of mass, stability of each face, no-bounce landing odds
- `npm run sim -- n=1000 friction=0.5 restitution=0.3 height=20` – Rapier Monte Carlo
- `npm run sweep` – grid over friction/bounciness/drop height scored against the observed 7/10/12/21 of 50

Assumptions: groove runs along the length; uniform density; face mapping base=upright, walls=long, gables=short, roof slopes=roof.
Unknown: table/felt friction and bounce. Measure them and pin the parameters.
