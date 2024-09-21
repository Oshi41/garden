import sinon from "sinon";
import {deepEqual as de} from 'assert';

describe('timers', () => {

    it('works', () => {
        const tick = 1000;
        const sandbox = sinon.createSandbox();
        sandbox.useFakeTimers({toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval']});
        let timer_fn = () => {
            console.log('Here');
        };
        timer_fn = sandbox.spy(timer_fn);

        let timer = setTimeout(timer_fn, tick);
        sandbox.clock.tick(tick - 1);
        de(timer_fn.called, false, 'Should not be called as it too early');

        clearTimeout(timer);
        sandbox.clock.tick(tick);
        de(timer_fn.called, false, 'Should not be called as timeout cleared');

        timer = setTimeout(timer_fn, tick);
        sandbox.clock.tick(tick);
        de(timer_fn.calledOnce, true, 'Should called once');
    });

    it('skip time but not call timeout', () => {
        const sandbox = sinon.createSandbox();
        sandbox.useFakeTimers({toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval']});
    });
});