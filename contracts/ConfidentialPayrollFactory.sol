// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./ConfidentialPayroll.sol";

/**
 * @title ConfidentialPayrollFactory
 * @notice Anyone can call create() to deploy their own ConfidentialPayroll
 *         instance. One deployment per wallet address.
 */
contract ConfidentialPayrollFactory {

    /// @notice Returns the payroll contract deployed by a given employer address.
    ///         Returns address(0) if none has been deployed yet.
    mapping(address => address) public userPayroll;

    /// @notice Ordered list of all payroll contracts ever created.
    address[] public allPayrolls;

    event PayrollCreated(address indexed employer, address indexed payroll);

    /**
     * @notice Deploy a fresh ConfidentialPayroll for the caller.
     * @dev    Reverts if the caller already has a deployed payroll.
     */
    function create() external returns (address) {
        require(
            userPayroll[msg.sender] == address(0),
            "ConfidentialPayrollFactory: already deployed"
        );

        ConfidentialPayroll payroll = new ConfidentialPayroll(msg.sender);
        userPayroll[msg.sender] = address(payroll);
        allPayrolls.push(address(payroll));

        emit PayrollCreated(msg.sender, address(payroll));
        return address(payroll);
    }

    /// @notice Total number of payroll contracts ever created through this factory.
    function totalPayrolls() external view returns (uint256) {
        return allPayrolls.length;
    }
}
