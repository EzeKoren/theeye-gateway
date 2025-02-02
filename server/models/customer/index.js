const mongoose = require('mongoose')
const apiFetch = require('../api-fetch')

module.exports = function (db) {
  const schema = new mongoose.Schema({
    name: {
      type: String,
      index: true,
      unique: true,
      required: true,
      dropDups: true
    },
    display_name: { type: String },
    description: { type: String, default: '' },
    config: {
      type: Object,
      default: () => {
        return {
          monitor: {},
          kibana: null,
          elasticsearch: {
            enabled: false,
            url: ''
          },
          ngrok: {
            enabled: false,
            authtoken: '',
            address: '',
            protocol: ''
          }
        }
      }
    },
    creation_date: { type: Date, default: () => { return new Date() } },
    last_update: { type: Date, default: () => { return new Date() } },
  }, {
    collection: 'customers',
    discriminatorKey: '_type'
  })

  const def = {
    getters: true,
    virtuals: true,
    transform (doc, ret, options) {
      ret.id = ret._id.toHexString()
      delete ret._id
      delete ret.__v
    }
  }

  schema.pre('save', function (next) {
    this.last_update = new Date()
    // do stuff
    next()
  })

  schema.set('toJSON', def)
  schema.set('toObject', def)

  schema.statics.apiFetch = apiFetch

  return db.model('Customer', schema)
}
