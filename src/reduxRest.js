/**
 * Utility class to automatically create Redux reducers for REST API endpoints.
 */
import request from 'superagent';
import itemStatus from './itemStatus';

export class Endpoint {
  constructor(url) {
    this.url = url;
  }

  list(params) {
    return request.get(this.url).query(params);
  }

  retrieve(id) {
    return request.get(this._getObjectURL(id));
  }

  create(conf) {
    return request.post(this.url).send(conf);
  }

  update(conf, id) {
    return request.put(this._getObjectURL(id)).send(conf);
  }

  _getObjectURL(id) {
    let slash = '';
    if (!this.url.endsWith('/')) {
      slash = '/';
    }
    return `${this.url}${slash}${id}`;
  }

}

export class ActionTypes {
  constructor(endpointName) {
    this.endpointName = endpointName;
    ['list', 'retrieve', 'create', 'update'].forEach(action => {
      this[`${action}`] = this.getConstant(action);
      ['success', 'failure'].forEach(result => {
        this[`${action}_${result}`] = this.getConstant(action, result);
      });
    });
  }

  getConstant(action, result) {
    let constant = `${this.endpointName}_${action}`;
    if (result) {
      constant = `${constant}_${result}`;
    }
    return constant;
  }
}

export class ActionCreators {
  constructor(endpointName, API, actionTypes) {
    this.actionTypes = actionTypes;
    this._pendingID = 0;
    ['list', 'retrieve', 'create', 'update'].forEach(action => {
      this[action] = this._createAction.bind(this, action, API[action].bind(API));
    });
  }

  _createAction(action, apiRequest, payload, objectID) {
    return (dispatch) => {
      let pendingID = this._getPendingID();
      let call = apiRequest(payload, objectID)
          .end((err, res) => {
            if (err) {
              dispatch(this._failure(action, 'error', pendingID));
            } else {
              dispatch(this._success(action, res.body, pendingID));
            }
          });
      dispatch(this._pending(action, payload, pendingID));
      return call;
    };
  }

  _success(...args) {
    return this._makeActionObject(...args, 'success');
  }

  _failure(...args) {
    return this._makeActionObject(...args, 'failure');
  }

  _pending(...args) {
    return this._makeActionObject(...args);
  }

  _makeActionObject(action, payload, pendingID, result) {
    let actionType = this.actionTypes.getConstant(action, result);
    return {
      type: actionType,
      payload: payload,
      pendingID: pendingID
    };
  }

  _getPendingID() {
    this._pendingID += 1;
    return this._pendingID;
  }
}

class BaseReducer {
  constructor(actionTypes) {
    this.actionTypes = actionTypes;
  }

  getReducer() {
    return this._reducer.bind(this);
  }

  _getItem(state, key, value) {
    return state.find(item => item[key] === value);
  }

  _replaceItem(state, key, value, newItem) {
    let index = state.findIndex(item => item[key] === value);
    let newState = [...state];
    newState.splice(index, 1, newItem);
    return newState;
  }
}

export class ItemReducer extends BaseReducer {

  _reducer(state = [], action) {
    let item;
    if (action.type === this.actionTypes.create) {
      item = {...action.payload, status: itemStatus.pending, pendingID: action.pendingID};
      return [...state, item];

    } else if (action.type === this.actionTypes.create_success) {
      item = {...action.payload, status: itemStatus.saved};
      return this._replaceItem(state, 'pendingID', action.pendingID, item);

    } else if (action.type === this.actionTypes.create_failure) {
      item = this._getItem(state, 'pendingID', action.pendingID);
      item.status = itemStatus.failed;
      return this._replaceItem(state, 'pendingID', action.pendingID, item);

    } else if (action.type === this.actionTypes.update) {
      item = {...action.payload, status: itemStatus.pending};
      // TODO shouldn't hardcode 'id' field
      return this._replaceItem(state, 'id', item.id, item);

    } else if (action.type === this.actionTypes.update_success) {
      item = {...action.payload, status: itemStatus.saved};
      // TODO shouldn't hardcode 'id' field
      return this._replaceItem(state, 'id', item.id, item);

    } else if (action.type === this.actionTypes.update_failure) {
      item = {...action.payload, status: itemStatus.failed};
      // TODO shouldn't hardcode 'id' field
      return this._replaceItem(state, 'id', item.id, item);

    } else if (action.type === this.actionTypes.list_success) {
      return [...action.payload];
    }

  }

}

export class CollectionReducer extends BaseReducer {

  _reducer(state = [], action) {
    let item;
    if (action.type === this.actionTypes.list) {
      item = {
        action: 'list',
        status: itemStatus.pending,
        pendingID: action.pendingID
      };
      return [...state, item];

    } else if (action.type === this.actionTypes.list_success) {
      item = {action: 'list', status: itemStatus.saved};
      return this._replaceItem(state, 'pendingID', action.pendingID, item);

    } else if (action.type === this.actionTypes.list_failure) {
      item = {action: 'list', status: itemStatus.failed};
      return this._replaceItem(state, 'pendingID', action.pendingID, item);
    }
  }
}

export default class Flux {
  constructor(APIConf) {
    this.API = {};
    this.actionTypes = {};
    this.actionCreators = {};
    this.reducers = {};
    for (let endpointName in APIConf) {
      if (APIConf.hasOwnProperty(endpointName)) {
        let url = APIConf[endpointName];
        this.API[endpointName] = new Endpoint(url);
        this.actionTypes[endpointName] = new ActionTypes(endpointName);
        this.actionCreators[endpointName] = new ActionCreators(
          endpointName,
          this.API[endpointName],
          this.actionTypes[endpointName]
        );
        this.reducers[`${endpointName}_items`] = new ItemReducer(
          this.actionTypes[endpointName]).getReducer();
        this.reducers[`${endpointName}_collection`] = new CollectionReducer(
          this.actionTypes[endpointName]).getReducer();
      }
    }
  }
}
