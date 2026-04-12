// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./ConfidentialPayroll.sol";

/**
 * @title ConfidentialPayrollFactory
 * @notice Anyone can call create() to deploy their own ConfidentialPayroll
 *         instance. One deployment per wallet address.
 *         The factory is deployed with the cUSDC and cUSDT wrapper addresses
 *         so every payroll contract it creates supports all three salary tokens.
 */
contract ConfidentialPayrollFactory {

    address public immutable confUsdcAddress;
    address public immutable confUsdtAddress;

    /// @notice Returns the payroll contract deployed by a given employer address.
    mapping(address => address) public userPayroll;

    /// @notice Ordered list of all payroll contracts ever created.
    address[] public allPayrolls;

    event PayrollCreated(address indexed employer, address indexed payroll);

    constructor(address _confUsdc, address _confUsdt) {
        require(_confUsdc != address(0), "Factory: zero cUSDC");
        require(_confUsdt != address(0), "Factory: zero cUSDT");
        confUsdcAddress = _confUsdc;
        confUsdtAddress = _confUsdt;
    }

    /**
     * @notice Deploy a fresh ConfidentialPayroll for the caller.
     * @dev    Reverts if the caller already has a deployed payroll.
     */
    function create() external returns (address) {
        require(
            userPayroll[msg.sender] == address(0),
            "ConfidentialPayrollFactory: already deployed"
        );

        ConfidentialPayroll payroll = new ConfidentialPayroll(
            msg.sender,
            confUsdcAddress,
            confUsdtAddress
        );
        userPayroll[msg.sender] = address(payroll);
        allPayrolls.push(address(payroll));

        emit PayrollCreated(msg.sender, address(payroll));
        return address(payroll);
    }

    function totalPayrolls() external view returns (uint256) {
        return allPayrolls.length;
    }
}
