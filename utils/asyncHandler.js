// Express 4 doesn't await async route handlers, so a rejected promise
// (e.g. a DB error) never reaches the error-handling middleware on its
// own - it becomes an unhandled rejection instead. Wrapping every async
// handler with this forwards the error to next(err) properly.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
