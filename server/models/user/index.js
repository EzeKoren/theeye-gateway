const mongoose = require('mongoose')

module.exports = function (db) {
  const schema = new mongoose.Schema({
    username: {
      type: String,
      unique: true,
      required: true
    },
    email: {
      type: String,
      unique: true,
      required: true
    },
    name: { type: 'string' },
    current_customer: { type: 'string' },
    customers: { type: 'array', default: [] },
    credential: { type: 'string', default: 'viewer' },
    enabled: { type: 'boolean', default: false },
    invitation_token: { type: 'string', default: '' },
    devices: { type: 'array', default: [] },
    notifications: {
      type: 'object',
      default: () => {
        return {
          mute: false,
          push: true,
          email: true,
          desktop: true
        }
      }
    },
    onboardingCompleted: { type: 'boolean', default: false }
  }, {
    collection: 'web_user',
    discriminatorKey: '_type'                                        
  })

  const def = {
    getters: true,
    virtuals: true,
    transform: function (doc, ret, options) {
      // remove the _id of every document before returning the result
      ret.id = ret._id
      delete ret._id
      delete ret.__v
    }
  }

  schema.set('toJSON', def)
  schema.set('toObject', def)

  return db.model('User', schema)
}
