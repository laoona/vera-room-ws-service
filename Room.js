const {
    gRequest,
    // QUERY_PERSONAL_ROOM,
    // QUERY_ROOM_LIST,
    QUERY_ROOM,
    UPDATE_ACTIVE,
    UPDATE_MEMBERS,
    NEW_ROOM
} = require("./graphqlClient");
const { sameUser } = require("./utils");
const { addUser, removeUser, getUsersInRoom } = require("./users");
const Rooms = {};
class Room {
    constructor({ id, temp = "false", link = "" }) {
        this.id = id;
        this.temp = temp === "false" ? false : true;
        this.link = link;
        this.active = false;
        this.members = null;
        this.keepUsers = [];
    }
    get activeUsers() {
        return getUsersInRoom(this.id);
    }
    async fetchData() {
        console.log("start fetch", this.temp, typeof this.temp);
        if (this.temp) { return; }
        const result = await gRequest(QUERY_ROOM, {
            id: this.id,
        });
        console.log("data fetched", result.portal_room);
        if (result && result.portal_room[0]) {
            const [{ active, members, link }] = result.portal_room;
            this.link = link;
            this.active = active;
            this.members = members.map(m => {
                const { id, ...rest } = m;
                return { uid: id, ...rest };
            });
            // 激活当前房间
            if (!active) {
                this.setActive();
            }
        }
    }
    saveToDatabase() {
        // 写回数据库
        let roomName = this.keepUsers.map(u => u.username).join(",");
        let creator = (this.keepUsers.find(u => u.creator == true) || { username: "" }).username;
        let { id, link } = this;
        const params = { creator, host: creator, name: roomName, id, link, members: this.keepUsers };
        gRequest(NEW_ROOM, params).then((wtf) => {
            console.log(wtf);
        });
    }
    setActive() {
        console.log("active the room");
        // 设置为活跃房间
        gRequest(UPDATE_ACTIVE, { active: true, id: this.id }).then((wtf) => {
            console.log(wtf);
        });
    }
    setInactive() {
        // 设置为不活跃房间
        gRequest(UPDATE_ACTIVE, { active: false, id: this.id }).then((wtf) => {
            console.log(wtf);
        });
    }
    appendMember(member) {
        // 更新参与者
        if (!this.members) return;
        // 如果没有uid，就pass掉
        if (!member.uid) return;
        const filterd = this.members.filter((m) => sameUser(m, member));
        console.log("filterd", filterd);
        if (filterd.length == 0) {
            // append member
            console.log("append member", member);
            gRequest(UPDATE_MEMBERS, {
                member,
                id: this.id,
            });
        }
    }
    addActiveUser(sid, user) {
        // 新增活跃用户
        let newUser = addUser(sid, this.id, user);
        return newUser;
    }
    addKeepUser(sid) {
        //   该用户选择保留临时房间
        const avtiveUser = this.activeUsers.find(u => u.id == sid);
        const filterd = this.keepUsers.filter((u) => sameUser(u, avtiveUser));
        if (filterd.length == 0) {
            this.keepUsers = [...this.keepUsers, avtiveUser];
        }
    }
    removeActiveUser(sid) {
        removeUser(sid);
        // 房间没人了
        if (this.activeUsers.length == 0) {
            console.log("nobody");
            console.log("select keep users", this.keepUsers);
            if (this.temp && this.keepUsers.length) {
                // 临时room，走一下存储逻辑
                console.log("save to db");
                this.saveToDatabase();
            } else {
                // 非临时room，设置为非活跃状态
                this.setInactive();
            }
            // 释放掉
            Rooms[this.id] = null;
        }
    }

}
const getRoomInstance = async ({ id, temp, link }) => {
    if (!Rooms[id]) {
        Rooms[id] = new Room({ id, temp, link });
    }
    await Rooms[id].fetchData();
    return Rooms[id];
};
module.exports = getRoomInstance;