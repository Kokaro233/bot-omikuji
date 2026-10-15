// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Omikuji — BOT Chain Edition
/// @notice Records shrine fortunes per wallet, limited per UTC+8 calendar day.
///         Pure entertainment: draws are free, carry no token, prize or value.
/// @dev Randomness is NOT secure. On BOT Chain `block.prevrandao` is a constant,
///      so entropy comes from the previous block hash, the timestamp, the caller
///      and two counters. Validators and simulators can predict or influence the
///      roll. This is acceptable only because outcomes have no economic value;
///      anything valuable would need a verifiable randomness provider.
contract FortuneContract {
    uint256 public constant MAX_DAILY_DRAWS = 10;
    uint256 public constant FORTUNE_COUNT = 7;
    uint256 private constant LOCAL_DAY_OFFSET = 8 hours;

    struct FortuneRecord {
        address wallet;
        uint256 fortuneId;
        uint256 timestamp;
    }

    mapping(address => mapping(uint256 => uint256)) public drawsPerDay;
    mapping(address => FortuneRecord[]) private records;
    uint256 public totalDraws;

    /// @param recordIndex position of this draw in the wallet's record list,
    ///        so a transaction maps 1:1 to `getFortuneAt(user, recordIndex)`.
    event FortuneDrawn(address indexed user, uint256 indexed recordIndex, uint256 fortuneId, uint256 timestamp);

    error DailyLimitReached(uint256 nextDrawTimestamp);
    error NoFortune();
    error RecordOutOfRange(uint256 index, uint256 length);

    function drawFortune() external returns (uint256 fortuneId) {
        uint256 currentDay = _localDay(block.timestamp);
        if (drawsPerDay[msg.sender][currentDay] >= MAX_DAILY_DRAWS) {
            revert DailyLimitReached(_localDayStartTimestamp(currentDay + 1));
        }

        uint256 recordIndex = records[msg.sender].length;
        uint256 roll = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.prevrandao,
                    block.timestamp,
                    msg.sender,
                    recordIndex,
                    totalDraws
                )
            )
        ) % 100;

        fortuneId = _fortuneForRoll(roll);
        drawsPerDay[msg.sender][currentDay] += 1;
        totalDraws += 1;
        records[msg.sender].push(FortuneRecord(msg.sender, fortuneId, block.timestamp));
        emit FortuneDrawn(msg.sender, recordIndex, fortuneId, block.timestamp);
    }

    function canDraw(address user) external view returns (bool) {
        return drawsPerDay[user][_localDay(block.timestamp)] < MAX_DAILY_DRAWS;
    }

    function remainingDraws(address user) external view returns (uint256) {
        uint256 used = drawsPerDay[user][_localDay(block.timestamp)];
        return used >= MAX_DAILY_DRAWS ? 0 : MAX_DAILY_DRAWS - used;
    }

    function getLatestFortune(address user) external view returns (FortuneRecord memory) {
        uint256 length = records[user].length;
        if (length == 0) revert NoFortune();
        return records[user][length - 1];
    }

    function getFortuneAt(address user, uint256 index) external view returns (FortuneRecord memory) {
        uint256 length = records[user].length;
        if (index >= length) revert RecordOutOfRange(index, length);
        return records[user][index];
    }

    /// @notice Page through a wallet's history without relying on log scans.
    /// @return page records [offset, offset + limit) clipped to the list length.
    function getFortunes(address user, uint256 offset, uint256 limit) external view returns (FortuneRecord[] memory page) {
        uint256 length = records[user].length;
        if (offset >= length) return new FortuneRecord[](0);
        uint256 end = offset + limit > length ? length : offset + limit;
        page = new FortuneRecord[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = records[user][i];
    }

    function getRecordCount(address user) external view returns (uint256) {
        return records[user].length;
    }

    function previewFortuneForRoll(uint256 roll) external pure returns (uint256) {
        require(roll < 100, "Roll out of range");
        return _fortuneForRoll(roll);
    }

    function currentLocalDay() external view returns (uint256) {
        return _localDay(block.timestamp);
    }

    function _localDay(uint256 timestamp) private pure returns (uint256) {
        return (timestamp + LOCAL_DAY_OFFSET) / 1 days;
    }

    function _localDayStartTimestamp(uint256 localDay) private pure returns (uint256) {
        return (localDay * 1 days) - LOCAL_DAY_OFFSET;
    }

    function _fortuneForRoll(uint256 roll) private pure returns (uint256) {
        if (roll < 5) return 0;  // 5%  Great Blessing / SSR
        if (roll < 17) return 1; // 12% Rising Fortune / SR
        if (roll < 35) return 2; // 18% Gentle Blessing / SR
        if (roll < 60) return 3; // 25% Good Fortune / R
        if (roll < 80) return 4; // 20% Future Fortune / R
        if (roll < 95) return 5; // 15% Caution / R
        return 6;                // 5% Great Caution / R
    }
}
