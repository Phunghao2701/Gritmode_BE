import { EventEmitter } from "node:events";

export const createRealtimeBus = () => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(1000);
  let sequence = 0;

  return {
    publish(event = {}) {
      const message = {
        id: String(++sequence),
        type: event.type || "message",
        data: event.data || {},
      };
      emitter.emit("event", message);
      return message;
    },
    subscribe(listener) {
      emitter.on("event", listener);
      return () => emitter.off("event", listener);
    },
  };
};

export const realtimeBus = createRealtimeBus();
