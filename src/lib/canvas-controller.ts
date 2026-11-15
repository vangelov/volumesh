// Original source: https://github.com/Twinklebear/webgl-volume-raycaster
import { vec2 } from "gl-matrix";

type Point = [number, number];

type MouseMoveCallback = (
  prevMouse: Point,
  curMouse: Point,
  evt: (MouseEvent | TouchEvent) & { buttons: number },
) => void;

type PressCallback = (curMouse: Point, evt: MouseEvent | TouchEvent) => void;

type AmountCallback = (amount: number) => void;

type TwoFingerDragCallback = (dragVector: vec2) => void;

/**
 * The controller can register callbacks for various events on a canvas:
 *
 * mousemove:
 *   Receives both regular mouse events and single-finger drags
 *   (sent as a left-click).
 *
 * press:
 *   Receives mouse click and touch start events.
 *
 * wheel:
 *   Mouse wheel scrolling.
 *
 * pinch:
 *   Two-finger pinch. Receives the distance change between the fingers.
 *
 * twoFingerDrag:
 *   Two-finger drag. Receives the drag movement amount.
 */
export class CanvasController {
  mousemove: MouseMoveCallback | null = null;
  press: PressCallback | null = null;
  wheel: AmountCallback | null = null;
  twoFingerDrag: TwoFingerDragCallback | null = null;
  pinch: AmountCallback | null = null;

  registerForCanvas(canvas: HTMLCanvasElement): void {
    let prevMouse: Point | null = null;

    const touches: Record<number, Point> = {};

    canvas.addEventListener("mousemove", (evt: MouseEvent) => {
      evt.preventDefault();

      const rect = canvas.getBoundingClientRect();

      const curMouse: Point = [evt.clientX - rect.left, evt.clientY - rect.top];

      if (!prevMouse) {
        prevMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
      } else if (this.mousemove) {
        this.mousemove(prevMouse, curMouse, evt);
      }

      prevMouse = curMouse;
    });

    canvas.addEventListener("mousedown", (evt: MouseEvent) => {
      evt.preventDefault();

      const rect = canvas.getBoundingClientRect();

      const curMouse: Point = [evt.clientX - rect.left, evt.clientY - rect.top];

      this.press?.(curMouse, evt);
    });

    canvas.addEventListener(
      "wheel",
      (evt: WheelEvent) => {
        evt.preventDefault();
        this.wheel?.(-evt.deltaY);
      },
      { passive: false },
    );

    canvas.oncontextmenu = (evt: MouseEvent) => {
      evt.preventDefault();
    };

    canvas.addEventListener(
      "touchstart",
      (evt: TouchEvent) => {
        evt.preventDefault();

        const rect = canvas.getBoundingClientRect();

        for (let i = 0; i < evt.changedTouches.length; ++i) {
          const touch = evt.changedTouches[i];

          const point: Point = [
            touch.clientX - rect.left,
            touch.clientY - rect.top,
          ];

          touches[touch.identifier] = point;

          if (evt.changedTouches.length === 1) {
            this.press?.(point, evt);
          }
        }
      },
      { passive: false },
    );

    canvas.addEventListener(
      "touchmove",
      (evt: TouchEvent) => {
        evt.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const numTouches = Object.keys(touches).length;

        // Single finger rotates the camera.
        if (numTouches === 1) {
          if (this.mousemove && evt.changedTouches.length > 0) {
            const touch = evt.changedTouches[0];
            const prevTouch = touches[touch.identifier];

            const curTouch: Point = [
              touch.clientX - rect.left,
              touch.clientY - rect.top,
            ];

            (evt as TouchEvent & { buttons: number }).buttons = 1;

            if (prevTouch) {
              this.mousemove(
                prevTouch,
                curTouch,
                evt as TouchEvent & { buttons: number },
              );
            }
          }
        } else if (numTouches >= 2) {
          const curTouches: Record<number, Point> = {};

          for (let i = 0; i < evt.changedTouches.length; ++i) {
            const touch = evt.changedTouches[i];

            curTouches[touch.identifier] = [
              touch.clientX - rect.left,
              touch.clientY - rect.top,
            ];
          }

          /*
           * If some touches didn't change, make sure they're
           * included so we can compute the pinch distance.
           */
          const oldTouches: Point[] = [];

          for (const id in touches) {
            const numericId = Number(id);

            if (!(numericId in curTouches)) {
              curTouches[numericId] = touches[numericId];
            }

            oldTouches.push(touches[numericId]);
          }

          const newTouches: Point[] = [];

          for (const id in curTouches) {
            newTouches.push(curTouches[Number(id)]);
          }

          if (oldTouches.length >= 2 && newTouches.length >= 2) {
            // Determine whether the user is pinching or panning.
            const motionVectors: [vec2, vec2] = [
              vec2.set(
                vec2.create(),
                newTouches[0][0] - oldTouches[0][0],
                newTouches[0][1] - oldTouches[0][1],
              ),
              vec2.set(
                vec2.create(),
                newTouches[1][0] - oldTouches[1][0],
                newTouches[1][1] - oldTouches[1][1],
              ),
            ];

            const motionDirs: [vec2, vec2] = [vec2.create(), vec2.create()];

            vec2.normalize(motionDirs[0], motionVectors[0]);

            vec2.normalize(motionDirs[1], motionVectors[1]);

            const pinchAxis = vec2.set(
              vec2.create(),
              oldTouches[1][0] - oldTouches[0][0],
              oldTouches[1][1] - oldTouches[0][1],
            );

            vec2.normalize(pinchAxis, pinchAxis);

            const panAxis = vec2.lerp(
              vec2.create(),
              motionVectors[0],
              motionVectors[1],
              0.5,
            );

            vec2.normalize(panAxis, panAxis);

            const pinchMotion: [number, number] = [
              vec2.dot(pinchAxis, motionDirs[0]),
              vec2.dot(pinchAxis, motionDirs[1]),
            ];

            const panMotion: [number, number] = [
              vec2.dot(panAxis, motionDirs[0]),
              vec2.dot(panAxis, motionDirs[1]),
            ];

            /*
             * If we're primarily moving along the pinch axis
             * and the fingers move in opposite directions,
             * the user is zooming.
             */
            if (
              this.pinch &&
              Math.abs(pinchMotion[0]) > 0.5 &&
              Math.abs(pinchMotion[1]) > 0.5 &&
              Math.sign(pinchMotion[0]) !== Math.sign(pinchMotion[1])
            ) {
              const oldDist = pointDist(oldTouches[0], oldTouches[1]);

              const newDist = pointDist(newTouches[0], newTouches[1]);

              this.pinch(newDist - oldDist);
            } else if (
              this.twoFingerDrag &&
              Math.abs(panMotion[0]) > 0.5 &&
              Math.abs(panMotion[1]) > 0.5 &&
              Math.sign(panMotion[0]) === Math.sign(panMotion[1])
            ) {
              // Pan by the average motion of both fingers.
              const panAmount = vec2.lerp(
                vec2.create(),
                motionVectors[0],
                motionVectors[1],
                0.5,
              );

              panAmount[1] = -panAmount[1];

              this.twoFingerDrag(panAmount);
            }
          }
        }

        // Update stored touch positions.
        for (let i = 0; i < evt.changedTouches.length; ++i) {
          const touch = evt.changedTouches[i];

          touches[touch.identifier] = [
            touch.clientX - rect.left,
            touch.clientY - rect.top,
          ];
        }
      },
      { passive: false },
    );

    const touchEnd = (evt: TouchEvent): void => {
      evt.preventDefault();

      for (let i = 0; i < evt.changedTouches.length; ++i) {
        const touch = evt.changedTouches[i];
        delete touches[touch.identifier];
      }
    };

    canvas.addEventListener("touchcancel", touchEnd, {
      passive: false,
    });

    canvas.addEventListener("touchend", touchEnd, {
      passive: false,
    });
  }
}

//

function pointDist(a: Point, b: Point) {
  var v = [b[0] - a[0], b[1] - a[1]];
  return Math.sqrt(Math.pow(v[0], 2.0) + Math.pow(v[1], 2.0));
}
