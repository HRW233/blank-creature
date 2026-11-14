# BLANK // CREATURE

A 3D sandbox where a blank neural network has to work out what its body is for.

**Play:** https://hrw233.github.io/blank-creature/

A four-legged ragdoll stands in a ringed arena. Its policy is 1,965 random weights: no pretraining, no scripted gait, no reward shaping beyond "cover ground without falling over". Watch it stand, shuffle and eventually steer toward the glowing goal, while the panel on the right shows the network thinking and the learning curve climbs.

## The body

29 point masses, 39 bones and braces, 25 contractile muscles, solved as a verlet ragdoll at 120 Hz.

- Four legs with a five-joint chain each: hip, knee, ankle, heel, toe.
- Each leg is braced into a triangle (a shoulder-to-ankle telescoping strut over the knee, fore and aft toe motors, an ankle muscle), so the body stands without any control at all. All the learning goes into moving it.
- Spine arch, neck lift, head pitch and turn, tail curl, left and right spine bend.
- Muscle tone, a 5% resting contraction, stands in for ligaments: without it the skeleton folds flat.

## The brain

30 sensors into 20, 20 and 25 motors, tanh throughout, about 1,965 weights, with a 20-unit recurrent loop that keeps roughly half a second of memory between control ticks. Physics runs at 120 Hz, the brain at 40 Hz.

## The learning

An OpenAI-ES style strategy: each generation samples 24 mirrored mutations of the current weights, scores them against one shared goal, ranks them, and takes a rank-shaped gradient step with Adam (sigma 0.1, lr 0.025).

An episode lasts 2.5 seconds and ends early if the creature goes down. Fitness is:

    8 * distance covered * stability  +  4 * survival
  + 1.5 * closeness * survival  +  0.5 * posture  -  energy

Ground is only credited while the torso is up, so diving at the goal never beats a stride. The creature in the arena always runs the best policy found so far; the trainer keeps running behind it and swaps the weights in mid-run.

## Controls

| Input | Action |
| --- | --- |
| drag, wheel | orbit, zoom |
| click the floor | move the goal |
| Space, T, S | pause, training on/off, speed |
| R, X, N | respawn, x-ray, new blank brain |

Learning is gradual: give it a minute or two.

## Files

    index.html              page and HUD
    sandbox.css             HUD styling
    js/sandbox/creature.js  body, physics, muscles, sensors
    js/sandbox/brain.js     policy net and evolution strategy
    js/sandbox/world.js     arena, lighting, camera, creature meshes
    js/sandbox/app.js       loop, telemetry, network view, input

No build step. three.js r128 loads from a CDN. Run it locally with any static server and open `index.html`.
